import { colbisnesEmailTemplate } from '@/lib/emailTemplate';
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, getIP } from "@/lib/rateLimit";
import { Resend } from "resend";
import crypto from "crypto";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  try {
    const ip = getIP(req);
    const rl = rateLimit(`forgot-password:${ip}`, { limit: 3, windowSeconds: 300 });
    if (!rl.allowed) {
      return NextResponse.json({ error: "Demasiados intentos. Intenta en 5 minutos." }, { status: 429 });
    }

    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email requerido" }, { status: 400 });
    }

    const emailLower = email.toLowerCase().trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailLower) || emailLower.length > 254) {
      return NextResponse.json({ error: "Email inválido" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email: emailLower } });

    // Always respond OK to avoid email enumeration
    if (!user) return NextResponse.json({ ok: true });

    // Generate a raw token and store its hash (so DB breach doesn't expose tokens)
    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Invalidate any existing token before creating new one
    await prisma.user.update({
      where: { email: emailLower },
      data: { resetToken: hashedToken, resetTokenExpiry: expiresAt },
    });

    const baseUrl = process.env.NEXT_PUBLIC_URL || process.env.NEXTAUTH_URL || "https://colbisnes-web.vercel.app";
    const resetUrl = baseUrl + "/auth/reset-password?token=" + rawToken;

    const html = colbisnesEmailTemplate({
      preheader: "Recupera tu contraseña",
      titulo: "Recupera tu contraseña 🔑",
      cuerpo: `Hola! Recibimos una solicitud para restablecer la contraseña de tu cuenta en Colbisnes.<br/><br/>Este enlace expira en <strong>15 minutos</strong>.<br/><br/>Si no fuiste tú, simplemente ignora este correo.`,
      ctaTexto: "Restablecer contraseña",
      ctaUrl: resetUrl,
    });

    await resend.emails.send({
      from: "hola@colbisnes.com",
      to: emailLower,
      subject: "Recupera tu contraseña en Colbisnes",
      html,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Error forgot-password:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
