import { colbisnesEmailTemplate } from "@/lib/emailTemplate";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, getIP } from "@/lib/rateLimit";
import { Resend } from "resend";
import crypto from "crypto";

const resend = new Resend(process.env.RESEND_API_KEY);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/auth/resend-verification — reenvía el correo de confirmación.
export async function POST(req: NextRequest) {
  try {
    const ip = getIP(req);
    const rl = rateLimit(`resend-verify:${ip}`, { limit: 3, windowSeconds: 300 });
    if (!rl.allowed) {
      return NextResponse.json({ error: "Demasiados intentos. Intenta en 5 minutos." }, { status: 429 });
    }

    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email requerido" }, { status: 400 });
    }
    const emailLower = email.toLowerCase().trim();
    if (!EMAIL_REGEX.test(emailLower) || emailLower.length > 254) {
      return NextResponse.json({ error: "Email inválido" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email: emailLower } });

    // Respondemos OK siempre para no permitir enumeración de correos registrados.
    if (!user || user.emailVerified) return NextResponse.json({ ok: true });

    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerifyToken: hashedToken, emailVerifyTokenExpiry: expiry },
    });

    const baseUrl = process.env.NEXT_PUBLIC_URL || process.env.NEXTAUTH_URL || "https://colbisnes.com";
    const verifyUrl = baseUrl + "/auth/verify?token=" + rawToken;

    await resend.emails.send({
      from: "Colbisnes <hola@colbisnes.com>",
      to: emailLower,
      subject: "Confirma tu correo en Colbisnes",
      html: colbisnesEmailTemplate({
        preheader: "Confirma tu correo para activar tu cuenta",
        titulo: "Confirma tu correo ✉️",
        cuerpo: `Recibimos una solicitud para reenviar tu enlace de confirmación.<br/><br/>Confirma tu correo para poder comprar y vender. Este enlace expira en <strong>24 horas</strong>.`,
        ctaTexto: "Confirmar mi correo",
        ctaUrl: verifyUrl,
      }),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Error resend-verification:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
