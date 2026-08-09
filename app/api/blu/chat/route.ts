import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, getIP } from "@/lib/rateLimit";
import { sendEmail } from "@/lib/email";
import { colbisnesEmailTemplate } from "@/lib/emailTemplate";
import { sendWhatsapp } from "@/lib/whatsapp";
import {
  BLU_FALLBACK,
  BLU_SALUDO_INICIAL,
  BLU_QUICK_REPLIES_DEFAULT,
  matchIntent,
  esSaludo,
  urlWhatsappSoporte,
} from "@/lib/bluFaq";

const QUICK_REPLIES_DEFAULT = BLU_QUICK_REPLIES_DEFAULT;

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

/**
 * Arma el mensaje que va precargado en WhatsApp cuando el cliente toca el boton verde.
 *
 * Lleva la consulta del propio cliente para que quien conteste en Colbisnes no tenga que
 * preguntar "¿en que le ayudo?" otra vez — llega con el contexto puesto. Se recorta a 300
 * caracteres porque el texto viaja dentro de la URL de wa.me y no vale la pena arriesgar
 * un enlace kilometrico; el resto de la conversacion queda igual guardado en BluMessage.
 */
function textoParaWhatsapp(mensaje: string, productoTitulo?: string | null): string {
  const recorte = mensaje.length > 300 ? mensaje.slice(0, 300) + "…" : mensaje;
  const lineas = ["Hola, vengo de colbisnes.com y necesito ayuda."];
  if (productoTitulo) lineas.push(`Producto: ${productoTitulo}`);
  lineas.push("", `Mi consulta: ${recorte}`);
  return lineas.join("\n");
}

/**
 * Bloque que el widget usa para pintar el boton verde de WhatsApp.
 *
 * Va SOLO la url, sin el numero por separado: el cliente no tiene por que verlo escrito.
 * Si queda a la vista lo copian y siguen la conversacion por fuera de Colbisnes, y ahi
 * ya no hay pedido, ni historial, ni forma de respaldar a nadie si algo sale mal.
 */
function bloqueWhatsapp(mensaje: string, productoTitulo?: string | null) {
  return { url: urlWhatsappSoporte(textoParaWhatsapp(mensaje, productoTitulo)) };
}

/**
 * Avisa a Colbisnes de que alguien pidio ayuda humana.
 *
 * OJO con el WhatsApp de aqui abajo: sale por lib/whatsapp.ts, que usa Twilio, y en
 * produccion NO estan puestas TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_FROM
 * (revisado el 2026-08-09). Sin ellas la funcion imprime un aviso en el log y retorna sin
 * enviar nada — por eso pedir un humano "no llevaba a nada". El correo a ADMIN_EMAIL si
 * sale, y el boton verde de WhatsApp que devuelve este endpoint es el camino que de verdad
 * pone al cliente en contacto. Esta llamada se deja puesta para que empiece a funcionar
 * sola el dia que se configure Twilio, pero hoy no hay que contar con ella.
 */
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
        const respuesta =
          "¡Listo! Ya le pasé tu correo al equipo de Colbisnes, te contactan pronto 🐾\n\nY si tienes afán, escríbenos de una por WhatsApp con el botón de aquí abajo 👇";
        await prisma.bluMessage.create({ data: { conversationId: conversation.id, autor: "BLU", texto: respuesta } });
        return json({
          conversationId: conversation.id,
          respuesta,
          quickReplies: QUICK_REPLIES_DEFAULT,
          escalado: true,
          whatsapp: bloqueWhatsapp(ultimaPregunta?.texto || mensaje, producto?.title),
        });
      } else {
        const respuesta =
          "Mmm, ahí no alcancé a ver un correo bien escrito 🐾 ¿me lo repites? (así: nombre@correo.com)\n\nO si prefieres no dejarlo, escríbenos de una por WhatsApp 👇";
        await prisma.bluMessage.create({ data: { conversationId: conversation.id, autor: "BLU", texto: respuesta } });
        return json({
          conversationId: conversation.id,
          respuesta,
          quickReplies: [],
          escalado: false,
          whatsapp: bloqueWhatsapp(mensaje),
        });
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
      const producto = productId
        ? await prisma.product.findUnique({ where: { id: productId }, select: { title: true } })
        : null;

      // El enlace de WhatsApp acompaña SIEMPRE a una escalada, haya sesión o no. Es el
      // unico camino que de verdad le llega hoy a una persona: el aviso por WhatsApp del
      // servidor (notificarEscalada) depende de Twilio, que no esta configurado, y se
      // rinde en silencio. Ver el comentario de notificarEscalada.
      const whatsapp = bloqueWhatsapp(mensaje, producto?.title);
      const contactoConocido = userEmail || conversation.userEmail;

      if (contactoConocido) {
        if (conversation.estado !== "ESCALADA") {
          await prisma.bluConversation.update({ where: { id: conversation.id }, data: { estado: "ESCALADA", escaladaAt: new Date() } });
          await notificarEscalada({ conversationId: conversation.id, contacto: contactoConocido, motivo: intent.id, ultimoMensaje: mensaje, productoTitulo: producto?.title });
        }
        return json({ conversationId: conversation.id, respuesta: intent.respuesta, quickReplies: QUICK_REPLIES_DEFAULT, escalado: true, whatsapp });
      }

      // Visitante sin sesion. Antes se le pedia el correo y ahi se acababa todo: si no lo
      // dejaba —que es lo normal cuando alguien solo quiere preguntar algo— nadie en
      // Colbisnes se enteraba de que habia pedido ayuda. Por eso "no llevaba a nada".
      // Ahora el boton de WhatsApp va por delante y el correo queda como alternativa,
      // no como peaje para poder hablar con alguien.
      await prisma.bluConversation.update({ where: { id: conversation.id }, data: { estado: "ESPERANDO_CONTACTO" } });
      // Se guarda solo el añadido: intent.respuesta ya quedó registrada unas lineas
      // arriba, y guardarla otra vez completa dejaba el mensaje duplicado en el historial.
      const invitacionCorreo = "Y si prefieres que te escribamos nosotros, déjame tu correo por aquí y le paso el dato al equipo 🐾";
      await prisma.bluMessage.create({ data: { conversationId: conversation.id, autor: "BLU", texto: invitacionCorreo } });
      return json({
        conversationId: conversation.id,
        respuesta: intent.respuesta + "\n\n" + invitacionCorreo,
        quickReplies: [],
        escalado: false,
        whatsapp,
      });
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

    // Control de propiedad: si la conversación tiene un dueño registrado (userId/userEmail),
    // solo ese usuario puede leerla. Las conversaciones anónimas (sin dueño) quedan accesibles
    // por su ID —igual que antes— porque no hay a quién atribuirlas. Evita que un usuario
    // logueado lea el historial de soporte de otra cuenta adivinando un conversationId.
    const conversation = await prisma.bluConversation.findUnique({
      where: { id: conversationId },
      select: { userId: true, userEmail: true },
    });
    if (!conversation) return json({ error: "Conversación no encontrada" }, 404);

    if (conversation.userId || conversation.userEmail) {
      const session = await getServerSession(authOptions);
      const esDueno =
        (!!conversation.userId && conversation.userId === session?.user?.id) ||
        (!!conversation.userEmail && !!session?.user?.email &&
          conversation.userEmail.toLowerCase() === session.user.email.toLowerCase());
      if (!esDueno) return json({ error: "No autorizado" }, 403);
    }

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
