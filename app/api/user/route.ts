import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { normalizarTelefonoCO } from "@/lib/phone";
import { sendEmail } from "@/lib/email";
import { sendWhatsapp } from "@/lib/whatsapp";
import { colbisnesEmailTemplate } from "@/lib/emailTemplate";

const SELECT_FIELDS = {
  id: true, name: true, email: true, phone: true, city: true, image: true,
  nequiNumber: true, brebId: true, createdAt: true,
  phoneWhatsapp: true, usdtWallet: true, usdtRed: true, direccionEnvio: true,
  antiPhishingCode: true,
  // Necesario para el cálculo de perfil completo y los avisos contextuales:
  // sin KYC aprobado el usuario no puede publicar ni recibir pagos.
  kycStatus: true,
};

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: SELECT_FIELDS,
    });
    return NextResponse.json(user);
  } catch (error) {
    console.error("GET /api/user error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await request.json();
    const campos = ["name", "phone", "city", "image", "nequiNumber", "brebId", "phoneWhatsapp", "usdtWallet", "usdtRed", "direccionEnvio"];

    const updateData: any = {};
    for (const campo of campos) {
      if (body[campo] !== undefined) updateData[campo] = body[campo];
    }

    // Código anti-phishing: 4–12 alfanuméricos (se normaliza a mayúsculas), o vacío para borrarlo.
    if (body.antiPhishingCode !== undefined) {
      const raw = String(body.antiPhishingCode || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (raw.length === 0) {
        updateData.antiPhishingCode = null;
      } else if (raw.length < 4 || raw.length > 12) {
        return NextResponse.json({ error: "El código anti-phishing debe tener entre 4 y 12 caracteres (letras y números)." }, { status: 400 });
      } else {
        updateData.antiPhishingCode = raw;
      }
    }

    // Evita evadir un bloqueo por incumplimiento de envío registrando el mismo número de
    // celular/WhatsApp (con deuda pendiente) en una cuenta nueva o distinta.
    const numerosNuevos = [updateData.phone, updateData.phoneWhatsapp]
      .filter((n): n is string => !!n && typeof n === "string" && n.trim().length > 0)
      .map((n) => normalizarTelefonoCO(n));
    if (numerosNuevos.length > 0) {
      const enListaNegra = await prisma.blacklist.findFirst({
        where: { telefono: { in: numerosNuevos }, activo: true, deudaPendienteCOP: { gt: 0 } },
      });
      if (enListaNegra) {
        return NextResponse.json(
          { error: "Este número está asociado a una deuda pendiente con Colbisnes. Contacta a soporte para regularizar tu situación." },
          { status: 403 }
        );
      }
    }

    // Estado ANTES de guardar, para detectar qué datos anti fraude / de cobro
    // se registran por primera vez y confirmarlos al usuario.
    const prevUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { nequiNumber: true, brebId: true, antiPhishingCode: true },
    });

    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: updateData,
      select: SELECT_FIELDS,
    });

    // ── Confirmación de registro de datos anti fraude / de cobro ──
    // Antes no se avisaba nada al usuario cuando terminaba de registrar estos datos.
    // Detectamos transición (vacío → con valor) y le confirmamos por correo y WhatsApp.
    const lleno = (v: unknown) => typeof v === "string" && v.trim().length > 0;
    const nuevos: string[] = [];
    if (!lleno(prevUser?.antiPhishingCode) && lleno(updatedUser.antiPhishingCode)) nuevos.push("Código anti fraude");
    if (!lleno(prevUser?.nequiNumber) && lleno(updatedUser.nequiNumber)) nuevos.push("Número Nequi");
    if (!lleno(prevUser?.brebId) && lleno(updatedUser.brebId)) nuevos.push("Llave Bre-B");

    if (nuevos.length > 0) {
      const nombre = updatedUser.name || "Hola";
      const lista = nuevos.map((n) => `<li style="margin-bottom:4px;">${n}</li>`).join("");
      const cuerpo = `<p style="margin:0 0 12px;">${nombre}, confirmamos que registraste correctamente:</p>` +
        `<ul style="margin:0 0 12px;padding-left:18px;">${lista}</ul>` +
        `<p style="margin:0;">Con estos datos ya puedes comprar y recibir pagos de forma segura en Colbisnes. Si no fuiste tú quien hizo este cambio, contáctanos de inmediato.</p>`;
      // No bloqueamos la respuesta si falla el envío.
      sendEmail({
        to: updatedUser.email!,
        subject: "Confirmamos el registro de tus datos en Colbisnes",
        html: colbisnesEmailTemplate({
          preheader: "Registramos tus datos anti fraude y de cobro.",
          titulo: "Datos registrados correctamente ✅",
          cuerpo,
          ctaTexto: "Ver mi perfil",
          ctaUrl: (process.env.NEXT_PUBLIC_URL || "https://colbisnes.com") + "/perfil/editar",
        }),
      }).catch((e) => console.error("Error enviando confirmación de registro (email):", e));

      if (lleno(updatedUser.phoneWhatsapp)) {
        sendWhatsapp({
          to: updatedUser.phoneWhatsapp!,
          body: `✅ Colbisnes: confirmamos el registro de tus datos (${nuevos.join(", ")}). Ya puedes comprar y recibir pagos de forma segura. Si no fuiste tú, contáctanos de inmediato.`,
        }).catch((e) => console.error("Error enviando confirmación de registro (WhatsApp):", e));
      }
    }

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error("PATCH /api/user error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
