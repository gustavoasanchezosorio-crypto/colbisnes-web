import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const VERIFF_API_KEY = process.env.VERIFF_API_KEY;

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const userId = session.user.id;
    console.log("Iniciando KYC para usuario:", userId);

    // Modo mock (sin Veriff)
    if (!VERIFF_API_KEY) {
      const mockUrl = `${process.env.NEXTAUTH_URL}/kyc/mock?userId=${userId}`;
      return NextResponse.json({ success: true, verificationUrl: mockUrl });
    }

    // Integración real con Veriff (cuando tengas las claves)
    // Por ahora, usamos mock
    const mockUrl = `${process.env.NEXTAUTH_URL}/kyc/mock?userId=${userId}`;
    return NextResponse.json({ success: true, verificationUrl: mockUrl });
  } catch (error) {
    console.error("Error en KYC start:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
