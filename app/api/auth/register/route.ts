import { colbisnesEmailTemplate } from "@/lib/emailTemplate";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, getIP } from "@/lib/rateLimit";
import { Resend } from "resend";
import bcrypt from "bcryptjs";
import crypto from "crypto";

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

    // Token de verificación de correo: guardamos solo el hash (si se filtra la BD, el token
    // en claro no queda expuesto). El enlace lleva el token en claro y expira en 24 horas.
    const rawVerifyToken = crypto.randomBytes(32).toString("hex");
    const hashedVerifyToken = crypto.createHash("sha256").update(rawVerifyToken).digest("hex");
    const verifyExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const user = await prisma.user.create({
      data: {
        email: emailLower,
        password: hashed,
        name: name?.trim() || null,
        emailVerifyToken: hashedVerifyToken,
        emailVerifyTokenExpiry: verifyExpiry,
      },
    });

    const baseUrl = process.env.NEXT_PUBLIC_URL || process.env.NEXTAUTH_URL || "https://colbisnes.com";
    const verifyUrl = baseUrl + "/auth/verify?token=" + rawVerifyToken;

    // Welcome email (non-blocking). El botón AHORA sí verifica el correo de verdad.
    resend.emails.send({
      from: "Colbisnes <hola@colbisnes.com>",
      to: emailLower,
      subject: "Bienvenido a Colbisnes",
      html: colbisnesEmailTemplate({
        preheader: "Confirma tu correo para activar tu cuenta",
        titulo: "Que bien, ya eres parte de Colbisnes! 🎉",
        cuerpo: `Bienvenido a la comunidad de compra y venta de segunda mano más activa de Colombia.<br/><br/>Solo falta un paso: confirma tu correo para poder comprar y vender. Este enlace expira en <strong>24 horas</strong>.`,
        ctaTexto: "Confirmar mi correo",
        ctaUrl: verifyUrl,
      }),
    }).catch((err) => console.error("Error enviando email de bienvenida:", err));

    return NextResponse.json({ success: true, user: { id: user.id, email: user.email } });
  } catch (error) {
    console.error("Error registro:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
