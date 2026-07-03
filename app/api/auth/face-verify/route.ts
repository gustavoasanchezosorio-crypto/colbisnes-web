import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, getIP } from "@/lib/rateLimit";
import crypto from "crypto";

const FACE_MATCH_THRESHOLD = 0.5;

function euclideanDistance(a: number[], b: number[]): number {
  return Math.sqrt(a.reduce((sum, val, i) => sum + Math.pow(val - b[i], 2), 0));
}

export async function POST(req: NextRequest) {
  try {
    const ip = getIP(req);
    const rl = rateLimit(`face-verify:${ip}`, { limit: 5, windowSeconds: 60 });
    if (!rl.allowed) {
      return NextResponse.json({ error: "Demasiados intentos. Intenta en 1 minuto." }, { status: 429 });
    }

    const { email, descriptor } = await req.json();

    if (!email || typeof email !== "string" || !descriptor || !Array.isArray(descriptor)) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, email: true, faceDescriptor: true },
    });

    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    if (!user.faceDescriptor) {
      return NextResponse.json(
        { error: "Este usuario no tiene reconocimiento facial configurado. Usa tu contraseña." },
        { status: 400 }
      );
    }

    const storedDescriptor = JSON.parse(user.faceDescriptor) as number[];
    const distance = euclideanDistance(descriptor, storedDescriptor);

    if (distance > FACE_MATCH_THRESHOLD) {
      return NextResponse.json(
        { error: "Rostro no reconocido. Intenta de nuevo o usa tu contraseña." },
        { status: 401 }
      );
    }

    // Store token in DB (survives serverless restarts unlike in-memory Map)
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes

    // Clean up expired tokens for this email first
    await prisma.faceToken.deleteMany({
      where: { email: user.email, expiresAt: { lt: new Date() } },
    });

    await prisma.faceToken.create({
      data: { token, email: user.email, expiresAt },
    });

    return NextResponse.json({ token, success: true });
  } catch (error) {
    console.error("Face verify error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token || token.length > 100) {
    return NextResponse.json({ error: "Token requerido" }, { status: 400 });
  }

  const entry = await prisma.faceToken.findUnique({ where: { token } });

  if (!entry || entry.expiresAt < new Date()) {
    if (entry) await prisma.faceToken.delete({ where: { token } });
    return NextResponse.json({ error: "Token inválido o expirado" }, { status: 401 });
  }

  // Single-use: delete after validation
  await prisma.faceToken.delete({ where: { token } });

  return NextResponse.json({ email: entry.email, valid: true });
}
