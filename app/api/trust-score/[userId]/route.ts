import { NextRequest, NextResponse } from "next/server";
import { computeTrustScore } from "@/lib/trustScore";
import { prisma } from "@/lib/prisma";

// GET /api/trust-score/[userId] — score de confianza público de un usuario (para mostrar en perfil/producto)
export async function GET(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params;
    const [result, usuario] = await Promise.all([
      computeTrustScore(userId),
      prisma.user.findUnique({ where: { id: userId }, select: { premiumStatus: true } }),
    ]);
    return NextResponse.json({ ...result, premium: usuario?.premiumStatus === "approved" });
  } catch (error: any) {
    console.error("Error calculando trust score:", error);
    return NextResponse.json({ error: "No se pudo calcular el score" }, { status: 500 });
  }
}
