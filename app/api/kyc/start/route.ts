import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";

const DIDIT_API_KEY = process.env.DIDIT_API_KEY!;
const DIDIT_WORKFLOW_ID = process.env.DIDIT_WORKFLOW_ID!;
const DIDIT_BASE_URL = "https://verification.didit.me/v3";

// POST /api/kyc/start — crea una sesión de verificación de identidad con Didit
// (documento + selfie con detección de vida real, comparación facial automática)
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Cada sesión Didit cuesta dinero y consume cuota: máximo 5 intentos por hora por usuario.
    const rl = rateLimit(`kyc-start:${session.user.id}`, { limit: 5, windowSeconds: 3600 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Demasiados intentos de verificación. Espera un momento antes de volver a intentar." },
        { status: 429 }
      );
    }

    if (!DIDIT_API_KEY || !DIDIT_WORKFLOW_ID) {
      return NextResponse.json({ error: "Verificación de identidad no configurada" }, { status: 500 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, kycStatus: true },
    });
    if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

    if (user.kycStatus === "approved") {
      return NextResponse.json({ success: true, status: "approved" });
    }

    const baseUrl = process.env.NEXT_PUBLIC_URL || "https://colbisnes.com";

    const res = await fetch(`${DIDIT_BASE_URL}/session/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": DIDIT_API_KEY,
      },
      body: JSON.stringify({
        workflow_id: DIDIT_WORKFLOW_ID,
        vendor_data: user.id,
        callback: `${baseUrl}/kyc?status=procesado`,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error("Error creando sesión Didit:", data);
      throw new Error(data.message || "Error al crear la sesión de verificación");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        kycStatus: "pending",
        kycDocumentId: data.session_id,
        kycRequestedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      verificationUrl: data.url,
      sessionId: data.session_id,
    });
  } catch (error: any) {
    console.error("Error en KYC start (Didit):", error);
    return NextResponse.json({ error: error.message || "Error interno" }, { status: 500 });
  }
}
