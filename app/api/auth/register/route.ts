import { colbisnesEmailTemplate } from "@/lib/emailTemplate";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, getIP } from "@/lib/rateLimit";
import { Resend } from "resend";
import bcrypt from "bcryptjs";

const resend = new Resend(process.env.RESEND_API_KEY);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

export async function POST(request: NextRequest) {
  try {
    const ip = getIP(request);
    const rl = rateLimit(`register:${ip}`, { limit: 5, windowSeconds: 600 });
    if (!rl.allowed) {
      return NextResponse.json({ error: "Demasiados registros desde esta IP. Intenta en 10 minutos." }, { status: 429 });
    }

    const { email, password, name } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email requerido" }, { status: 400 });
    }
    const emailLower = email.toLowerCase().trim();
    if (!EMAIL_REGEX.test(emailLower) || emailLower.length > 254) {
      return NextResponse.json({ error: "Email inválido" }, { status: 400 });
    }
    if (!password || typeof password !== "string") {
      return NextResponse.json({ error: "Contraseña requerida" }, { status: 400 });
    }
    if (!PASSWORD_REGEX.test(password)) {
      return NextResponse.json(
        { error: "La contraseña debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número." },
        { status: 400 }
      );
    }
    if (name && (typeof name !== "string" || name.length > 100)) {
      return NextResponse.json({ error: "Nombre inválido" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email: emailLower } });
    if (existing) return NextResponse.json({ error: "Email ya registrado" }, { status: 400 });

    // Evita que alguien con una deuda pendiente por incumplimiento de envío evada el bloqueo
    // simplemente registrando una cuenta nueva con otro correo.
    const enListaNegra = await prisma.blacklist.findFirst({
      where: { email: emailLower, activo: true, deudaPendienteCOP: { gt: 0 } },
    });
    if (enListaNegra) {
      return NextResponse.json(
        { error: "No es posible crear una cuenta con este correo por una deuda pendiente con Colbisnes. Contacta a soporte para regularizar tu situación." },
        { status: 403 }
      );
    }

    const hashed = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email: emailLower, password: hashed, name: name?.trim() || null },
    });

    // Welcome email (non-blocking)
    resend.emails.send({
      from: "Colbisnes <hola@colbisnes.com>",
      to: emailLower,
      subject: "Bienvenido a Colbisnes",
      html: colbisnesEmailTemplate({
        preheader: "Bienvenido a Colbisnes",
        titulo: "Que bien, ya eres parte de Colbisnes! 🎉",
        cuerpo: `Bienvenido a la comunidad de compra y venta de segunda mano más activa de Colombia.<br/><br/>Confirma tu correo y empieza a cerrar tu primer bisnes.`,
        ctaTexto: "Confirmar mi correo",
        ctaUrl: "https://colbisnes-web.vercel.app/auth/login",
      }),
    }).catch((err) => console.error("Error enviando email de bienvenida:", err));

    return NextResponse.json({ success: true, user: { id: user.id, email: user.email } });
  } catch (error) {
    console.error("Error registro:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
