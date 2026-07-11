import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const ANTI_PHISHING_ERROR = {
  error: "Debes crear tu código anti-phishing en tu perfil antes de comprar o vender. Ve a colbisnes.com/perfil/editar",
  antiPhishingRequired: true,
};

// Devuelve una respuesta 403 si el usuario no tiene código anti-phishing configurado; null si ya lo tiene.
// Ese código permite al usuario reconocer los correos legítimos de Colbisnes y evitar suplantaciones.
export async function requireAntiPhishing(userId: string): Promise<NextResponse | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { antiPhishingCode: true },
  });
  if (!user?.antiPhishingCode || user.antiPhishingCode.trim().length === 0) {
    return NextResponse.json(ANTI_PHISHING_ERROR, { status: 403 });
  }
  return null;
}
