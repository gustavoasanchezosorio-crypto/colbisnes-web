import { NextRequest, NextResponse } from "next/server";
import { computeTrustScore } from "@/lib/trustScore";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/trust-score/[userId] — score de confianza público de un usuario (para mostrar en perfil/producto)
export async function GET(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params;
    const result = await computeTrustScore(userId);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error calculando trust score:", error);
    return NextResponse.json({ error: "No se pudo calcular el score" }, { status: 500 });
  }
}
