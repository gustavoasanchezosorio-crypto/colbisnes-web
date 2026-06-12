import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

// Umbral de similitud facial (0.5 = estricto, 0.6 = moderado)
const FACE_MATCH_THRESHOLD = 0.5;

function euclideanDistance(a: number[], b: number[]): number {
  return Math.sqrt(a.reduce((sum, val, i) => sum + Math.pow(val - b[i], 2), 0));
}

// Tokens temporales en memoria (en producción usar Redis)
const faceTokens = new Map<string, { email: string; expiresAt: number }>();

export async function POST(req: NextRequest) {
  try {
    const { email, descriptor } = await req.json();

    if (!email || !descriptor || !Array.isArray(descriptor)) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    // Buscar usuario con descriptor facial registrado
    const user = await prisma.user.findUnique({
      where: { email },
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

    // Comparar descriptores
    const storedDescriptor = JSON.parse(user.faceDescriptor) as number[];
    const distance = euclideanDistance(descriptor, storedDescriptor);

    if (distance > FACE_MATCH_THRESHOLD) {
      return NextResponse.json(
        { error: "Rostro no reconocido. Intenta de nuevo o usa tu contraseña." },
        { status: 401 }
      );
    }

    // Generar token temporal (válido 2 minutos)
    const token = crypto.randomBytes(32).toString("hex");
    faceTokens.set(token, {
      email: user.email,
      expiresAt: Date.now() + 2 * 60 * 1000,
    });

    return NextResponse.json({ token, success: true });
  } catch (error) {
    console.error("Face verify error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

// Validar token facial (usado por NextAuth)
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Token requerido" }, { status: 400 });

  const entry = faceTokens.get(token);
  if (!entry || entry.expiresAt < Date.now()) {
    faceTokens.delete(token);
    return NextResponse.json({ error: "Token inválido o expirado" }, { status: 401 });
  }

  faceTokens.delete(token); // Usar una sola vez
  return NextResponse.json({ email: entry.email, valid: true });
}
