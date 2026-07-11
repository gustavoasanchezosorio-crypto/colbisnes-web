import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, getIP } from "@/lib/rateLimit";
import { sendEmail } from "@/lib/email";
import { colbisnesEmailTemplate } from "@/lib/emailTemplate";
import { sendWhatsapp } from "@/lib/whatsapp";
import { BLU_FALLBACK, BLU_SALUDO_INICIAL, BLU_QUICK_REPLIES_DEFAULT, matchIntent, esSaludo } from "@/lib/bluFaq";

const QUICK_REPLIES_DEFAULT = BLU_QUICK_REPLIES_DEFAULT;

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

async function notificarEscalada(params: { conversationId: string; contacto: string; motivo: string; ultimoMensaje: string; productoTitulo?: string | null }) {
  const { conversationId, contacto, motivo, ultimoMensaje, productoTitulo } = params;
  try {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
      const html = colbisnesEmailTemplate({
        preheader: "Nueva conversacion escalada por Chucho Bot",
        titulo: "🐾 Chucho Bot escaló una conversación a soporte",
        cuerpo: `Contacto: <strong>${contacto}</strong><br/>Motivo: <strong>${motivo}</strong>${productoTitulo ? `<br/>Producto: <strong>${productoTitulo}</strong>` : ""}<br/><br/>Último mensaje del usuario:<br/><em>"${ultimoMensaje}"</em><br/><br/>ID de conversación: ${conversationId}`,
        ctaTexto: "Ir al panel admin",
        ctaUrl: "https://colbisnes.com/admin",
      });
      await sendEmail({ to: adminEmail, subject: "🐾 Chucho Bot: nueva conversación escalada", html });
    }
    if (process.env.ADMIN_WHATSAPP) {
      await sendWhatsapp({
        to: process.env.ADMIN_WHATSAPP,
        body: `🐾 *Chucho Bot* escaló una conversación\n\nContacto: ${contacto}\nMotivo: ${motivo}${productoTitulo ? `\nProducto: ${productoTitulo}` : ""}\n\n"${ultimoMensaje}"`,
      });
    }
  } catch (e) {
    console.error("Error notificando escalada de Chucho Bot:", e);
  }
}

export async function POST(request: Request) {
  try {
    const ip = getIP(request);
    const rl = rateLimit(`blu-chat:${ip}`, { limit: 30, windowSeconds: 300 });
    if (!rl.allowed) {
      return json({ error: "Muchos mensajes seguidos. Espera un momento e intenta de nuevo." }, 429);
    }

    const body = await request.json().catch(() => ({}));
    const mensaje = typeof body.mensaje === "string" ? body.mensaje.trim() : "";
    const conversationId = typeof body.conversationId === "string" ? body.conversationId : null;
    const productId = typeof body.productId === "string" ? body.productId : null;

    if (!mensaje) return json({ error: "Falta el mensaje" }, 400);
    if (mensaje.length > 1000) return json({ error: "El mensaje es muy largo (máx. 1000 caracteres)" }, 400);

    const session = await getServerSession(authOptions);
    const userId = session?.user?.id || null;
    const userEmail = session?.user?.email || null;

    // Recupera o crea la conversacion
    let conversation = conversationId ? await prisma.bluConversation.findUnique({ where: { id: conversationId } }) : null;
    if (!conversation) {
      conversation = await prisma.bluConversation.create({
        data: { userId, userEmail, productId: productId || undefined },
      });
    }

    await prisma.bluMessage.create({
      data: { conversationId: conversation.id, autor: "USUARIO", texto: mensaje },
    });

    // Estado especial: esperando que el usuario (anonimo) deje un correo de contacto
    if (conversation.estado === "ESPERANDO_CONTACTO") {
      const match = mensaje.match(EMAIL_REGEX);
      if (match) {
        const correo = match[0];
        conversation = await prisma.bluConversation.update({
          where: { id: conversation.id },
          data: { userEmail: correo, estado: "ESCALADA", escaladaAt: new Date() },
        });
        const producto = productId ? await prisma.product.findUnique({ where: { id: productId }, select: { title: true } }) : null;
        const historial = await prisma.bluMessage.findMany({ where: { conversationId: conversation.id }, orderBy: { createdAt: "asc" }, take: 20 });
        const ultimaPregunta = [...historial].reverse().find(m => m.autor === "USUARIO" && !EMAIL_REGEX.test(m.texto));
        await notificarEscalada({
          conversationId: conversation.id,
          contacto: correo,
          motivo: "Solicitud de soporte humano",
          ultimoMensaje: ultimaPregunta?.texto || mensaje,
          productoTitulo: producto?.title,
        });
        const respuesta = "¡Gracias! Ya avisé al equipo de Colbisnes con tu correo — te contactarán pronto. 🐾";
        await prisma.bluMessage.create({ data: { conversationId: conversation.id, autor: "BLU", texto: respuesta } });
        return json({ conversationId: conversation.id, respuesta, quickReplies: QUICK_REPLIES_DEFAULT, escalado: true });
      } else {
        const respuesta = "No alcancé a reconocer un correo válido ahí 🐾 ¿me lo compartes de nuevo? (ej: nombre@correo.com)";
        await prisma.bluMessage.create({ data: { conversationId: conversation.id, autor: "BLU", texto: respuesta } });
        return json({ conversationId: conversation.id, respuesta, quickReplies: [], escalado: false });
      }
    }

    if (esSaludo(mensaje)) {
      await prisma.bluMessage.create({ data: { conversationId: conversation.id, autor: "BLU", texto: BLU_SALUDO_INICIAL, intencion: "saludo" } });
      return json({ conversationId: conversation.id, respuesta: BLU_SALUDO_INICIAL, quickReplies: QUICK_REPLIES_DEFAULT, escalado: false });
    }

    const intent = matchIntent(mensaje);

    if (!intent) {
      await prisma.bluMessage.create({ data: { conversationId: conversation.id, autor: "BLU", texto: BLU_FALLBACK } });
      return json({ conversationId: conversation.id, respuesta: BLU_FALLBACK, quickReplies: QUICK_REPLIES_DEFAULT, escalado: false });
    }

    await prisma.bluMessage.create({ data: { conversationId: conversation.id, autor: "BLU", texto: intent.respuesta, intencion: intent.id } });

    if (intent.escalar) {
      const contactoConocido = userEmail || conversation.userEmail;
      if (contactoConocido) {
        const yaEscalada = conversation.estado === "ESCALADA";
        if (!yaEscalada) {
          const producto = productId ? await prisma.product.findUnique({ where: { id: productId }, select: { title: true } }) : null;
          await prisma.bluConversation.update({ where: { id: conversation.id }, data: { estado: "ESCALADA", escaladaAt: new Date() } });
          await notificarEscalada({ conversationId: conversation.id, contacto: contactoConocido, motivo: intent.id, ultimoMensaje: mensaje, productoTitulo: producto?.title });
        }
        return json({ conversationId: conversation.id, respuesta: intent.respuesta, quickReplies: QUICK_REPLIES_DEFAULT, escalado: true });
      } else {
        await prisma.bluConversation.update({ where: { id: conversation.id }, data: { estado: "ESPERANDO_CONTACTO" } });
        const respuestaConCorreo = intent.respuesta + "\n\n¿Me compartes tu correo para que el equipo de Colbisnes te contacte?";
        await prisma.bluMessage.create({ data: { conversationId: conversation.id, autor: "BLU", texto: respuestaConCorreo } });
        return json({ conversationId: conversation.id, respuesta: respuestaConCorreo, quickReplies: [], escalado: false });
      }
    }

    return json({ conversationId: conversation.id, respuesta: intent.respuesta, quickReplies: QUICK_REPLIES_DEFAULT, escalado: false });
  } catch (error) {
    console.error("Error en /api/blu/chat:", error);
    return json({ error: "Chucho Bot tuvo un problema para responder. Intenta de nuevo en un momento." }, 500);
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get("conversationId");
    if (!conversationId) return json({ error: "Falta conversationId" }, 400);

    const mensajes = await prisma.bluMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      select: { autor: true, texto: true, createdAt: true },
    });
    return json({ mensajes, quickReplies: QUICK_REPLIES_DEFAULT });
  } catch (error) {
    console.error("Error en GET /api/blu/chat:", error);
    return json({ error: "Error cargando la conversación" }, 500);
  }
}
