import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, getIP } from "@/lib/rateLimit";
import crypto from "crypto";

// POST /api/auth/verify — confirma el correo de un usuario a partir del token del email.
// El enlace del correo apunta a /auth/verify?token=... (página) que a su vez llama aquí.
export async function POST(req: NextRequest) {
  try {
    const ip = getIP(req);
    const rl = rateLimit(`verify-email:${ip}`, { limit: 10, windowSeconds: 300 });
    if (!rl.allowed) {
      return NextResponse.json({ error: "Demasiados intentos. Intenta en unos minutos." }, { status: 429 });
    }

    const { token } = await req.json();
    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Token requerido" }, { status: 400 });
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await prisma.user.findFirst({
      where: { emailVerifyToken: hashedToken, emailVerifyTokenExpiry: { gt: new Date() } },
    });

    if (!user) {
      // Puede ser un token ya usado (limpiado) o expirado. No revelamos cuál.
      return NextResponse.json({ error: "Enlace inválido o expirado. Solicita uno nuevo." }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: new Date(), emailVerifyToken: null, emailVerifyTokenExpiry: null },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
