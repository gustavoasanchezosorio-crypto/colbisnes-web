import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const EMAIL_VERIFY_ERROR = {
  error: "Debes confirmar tu correo antes de comprar o vender. Revisa el enlace que te enviamos al registrarte (o pide uno nuevo en colbisnes.com/auth/verify).",
  emailVerificationRequired: true,
};

// Devuelve una respuesta 403 si el usuario aún no confirmó su correo; null si ya está verificado.
export async function requireEmailVerified(userId: string): Promise<NextResponse | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailVerified: true },
  });
  if (!user?.emailVerified) {
    return NextResponse.json(EMAIL_VERIFY_ERROR, { status: 403 });
  }
  return null;
}
