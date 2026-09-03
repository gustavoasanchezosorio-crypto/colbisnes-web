import { colbisnesEmailTemplate } from "@/lib/emailTemplate";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, getIP } from "@/lib/rateLimit";
import { Resend } from "resend";
// Ver la nota en lib/auth.ts: mismo formato de hash, pero fuera del event loop.
import * as bcrypt from "@node-rs/bcrypt";
import crypto from "crypto";

const resend = new Resend(process.env.RESEND_API_KEY);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

// ---------------------------------------------------------------------------
// Reintentos del correo de verificación (2026-07-30).
//
// Antes esto era `resend.emails.send({...}).catch(console.error)`, y tenía dos
// agujeros:
//
//   1. El SDK de Resend NO lanza excepción cuando la API responde con error:
//      devuelve `{ data, error }` (se ve en lib/email.ts, que sí lo maneja).
//      Ese `.catch()` solo atrapaba fallos de red, así que un "cuota diaria
//      agotada" —el plan gratuito son 100 correos al día— se descartaba en
//      silencio absoluto: ni una línea en los logs. El usuario se quedaba sin
//      poder activar su cuenta y nosotros sin enterarnos.
//   2. Sin reintentos, un hipo momentáneo de Resend tenía el mismo efecto
//      definitivo que una caída total.
//
// El registro NUNCA falla por culpa del correo: la cuenta ya quedó creada y el
// usuario puede pedir un reenvío. Pero si se agotan los intentos, ahora queda
// una línea inequívoca y buscable en los logs.
// ---------------------------------------------------------------------------

const REINTENTOS_CORREO = 3;
// Retroceso exponencial entre intentos. Con 3 intentos se usan los dos primeros
// valores (hay 2 huecos entre 3 intentos); el tercero queda listo por si algún
// día se sube el número.
const ESPERAS_MS = [1000, 2000, 4000];

type PayloadCorreo = Parameters<typeof resend.emails.send>[0];

async function enviarVerificacionConReintentos(destinatario: string, payload: PayloadCorreo) {
  for (let intento = 1; intento <= REINTENTOS_CORREO; intento++) {
    let permanente = false;

    try {
      const { error } = await resend.emails.send(payload);
      if (!error) return; // enviado, no hay nada más que hacer

      // Un 4xx que no sea 429 es permanente (correo inválido, dominio no
      // verificado, clave revocada...). Reintentarlo es quemar cuota para nada.
      const status = (error as { statusCode?: number }).statusCode;
      permanente = typeof status === "number" && status >= 400 && status < 500 && status !== 429;

      console.error(
        `Correo de verificación, intento ${intento}/${REINTENTOS_CORREO} falló` +
          (permanente ? " (error permanente, no se reintenta)" : "") + ":",
        error
      );
    } catch (err) {
      // Aquí sí caen los fallos de red / DNS / timeout.
      console.error(
        `Correo de verificación, intento ${intento}/${REINTENTOS_CORREO} falló (error de red):`,
        err
      );
    }

    if (permanente) break;
    if (intento < REINTENTOS_CORREO) {
      await new Promise((resolver) => setTimeout(resolver, ESPERAS_MS[intento - 1]));
    }
  }

  console.error(`[VERIFICATION EMAIL FAILED] para ${destinatario}`);
}

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

    // Correo de CONFIRMACIÓN DE DIRECCIÓN (no es la bienvenida). Sigue siendo
    // deliberadamente "dispara y olvida": el usuario no debe esperar a que Resend
    // conteste para que su registro termine. Reintenta y, si aun así falla, deja
    // rastro (ver arriba).
    //
    // El asunto decía "Bienvenido a Colbisnes", que era mentira a medias y ahora
    // sería confuso de verdad: desde el 2026-09-02 la bienvenida de verdad sale
    // al confirmar la dirección (app/api/auth/verify), y dos correos seguidos
    // con asunto parecido se leen como un reenvío. Se usa el mismo asunto que
    // ya usaba /api/auth/resend-verification, que es el mismo correo.
    void enviarVerificacionConReintentos(emailLower, {
      from: "Colbisnes <hola@colbisnes.com>",
      to: emailLower,
      subject: "Confirma tu correo en Colbisnes",
      html: colbisnesEmailTemplate({
        preheader: "Confirma tu correo para activar tu cuenta",
        titulo: "Que bien, ya eres parte de Colbisnes! 🎉",
        cuerpo: `Bienvenido a la comunidad de compra y venta de segunda mano más activa de Colombia.<br/><br/>Solo falta un paso: confirma tu correo para poder comprar y vender. Este enlace expira en <strong>24 horas</strong>.`,
        ctaTexto: "Confirmar mi correo",
        ctaUrl: verifyUrl,
      }),
    });

    return NextResponse.json({ success: true, user: { id: user.id, email: user.email } });
  } catch (error) {
    console.error("Error registro:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
