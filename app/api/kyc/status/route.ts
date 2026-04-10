import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        kycLevel: true,
        kycStatus: true,
        kycRequestedAt: true,
        kycApprovedAt: true,
        kycRejectedAt: true,
      },
    });

    return NextResponse.json(user || { kycLevel: 0, kycStatus: "pending" });
  } catch (error) {
    console.error("Error en GET /api/kyc/status:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
