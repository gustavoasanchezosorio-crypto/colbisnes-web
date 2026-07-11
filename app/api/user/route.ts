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

    // Estado ANTES de guardar, para detectar qué datos sensibles (anti fraude,
    // cobro y wallet USDT) cambian y confirmárselo al usuario CADA vez que se modifican.
    const prevUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { nequiNumber: true, brebId: true, antiPhishingCode: true, usdtWallet: true },
    });

    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: updateData,
      select: SELECT_FIELDS,
    });

    // ── Confirmación de cambio de datos sensibles ──
    // Se envía SIEMPRE que uno de estos datos se modifique (no solo la primera vez):
    // dejar de avisar los cambios posteriores genera desconfianza. Detecta cualquier
    // diferencia respecto al valor anterior (registro, edición o borrado).
    const norm = (v: unknown) => (typeof v === "string" ? v.trim() : v ?? "");
    const cambios: string[] = [];
    if (norm(prevUser?.antiPhishingCode) !== norm(updatedUser.antiPhishingCode)) cambios.push("Código anti fraude");
    if (norm(prevUser?.nequiNumber) !== norm(updatedUser.nequiNumber)) cambios.push("Número Nequi");
    if (norm(prevUser?.brebId) !== norm(updatedUser.brebId)) cambios.push("Llave Bre-B");
    if (norm(prevUser?.usdtWallet) !== norm(updatedUser.usdtWallet)) cambios.push("Wallet USDT");

    if (cambios.length > 0) {
      const nombre = updatedUser.name || "Hola";
      const lista = cambios.map((n) => `<li style="margin-bottom:4px;">${n}</li>`).join("");
      const cuerpo = `<p style="margin:0 0 12px;">${nombre}, confirmamos que se actualizaron estos datos de tu cuenta:</p>` +
        `<ul style="margin:0 0 12px;padding-left:18px;">${lista}</ul>` +
        `<p style="margin:0;"><b>Si no fuiste tú quien hizo este cambio, contáctanos de inmediato</b>: podría tratarse de un intento de fraude sobre tu cuenta.</p>`;
      // No bloqueamos la respuesta si falla el envío.
      sendEmail({
        to: updatedUser.email!,
        subject: "Se modificaron datos sensibles de tu cuenta Colbisnes",
        html: colbisnesEmailTemplate({
          preheader: "Confirmación de cambio en tus datos anti fraude / de cobro.",
          titulo: "Datos actualizados en tu cuenta 🔒",
          cuerpo,
          ctaTexto: "Revisar mi perfil",
          ctaUrl: (process.env.NEXT_PUBLIC_URL || "https://colbisnes.com") + "/perfil/editar",
        }),
      }).catch((e) => console.error("Error enviando confirmación de cambio (email):", e));

      const norm2 = (v: unknown) => typeof v === "string" && v.trim().length > 0;
      if (norm2(updatedUser.phoneWhatsapp)) {
        sendWhatsapp({
          to: updatedUser.phoneWhatsapp!,
          body: `🔒 Colbisnes: se actualizaron datos sensibles de tu cuenta (${cambios.join(", ")}). Si NO fuiste tú, contáctanos de inmediato: podría ser un intento de fraude.`,
        }).catch((e) => console.error("Error enviando confirmación de cambio (WhatsApp):", e));
      }
    }

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error("PATCH /api/user error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
