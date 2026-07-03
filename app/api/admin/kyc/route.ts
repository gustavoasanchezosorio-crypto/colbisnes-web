import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { colbisnesEmailTemplate } from "@/lib/emailTemplate";

function esAdmin(email: string) {
  return email?.toLowerCase() === process.env.ADMIN_EMAIL?.toLowerCase();
}

// GET: listar solicitudes KYC pendientes (y aprobadas/rechazadas recientes)
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !esAdmin(session.user.email)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const filtro = searchParams.get("status") || "pending";

    const usuarios = await prisma.user.findMany({
      where: { kycStatus: filtro },
      orderBy: { kycRequestedAt: "desc" },
      take: 50,
      select: {
        id: true,
        name: true,
        email: true,
        kycStatus: true,
        kycRequestedAt: true,
        kycApprovedAt: true,
        kycRejectedAt: true,
        kycDocumentId: true,
        createdAt: true,
      },
    });

    // Parse kycDocumentId JSON for each user
    const result = usuarios.map((u) => {
      let docs: { selfieUrl?: string; cedulaUrl?: string } = {};
      try {
        if (u.kycDocumentId) docs = JSON.parse(u.kycDocumentId);
      } catch {}
      return { ...u, kycDocumentId: undefined, docs };
    });

    return NextResponse.json({ usuarios: result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: rechazar KYC con motivo
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !esAdmin(session.user.email)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { userId, motivo } = await req.json();
    if (!userId) return NextResponse.json({ error: "userId requerido" }, { status: 400 });

    const usuario = await prisma.user.update({
      where: { id: userId },
      data: {
        kycStatus: "rejected",
        kycRejectedAt: new Date(),
      },
      select: { email: true, name: true },
    });

    // Email de rechazo
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "Colbisnes <hola@colbisnes.com>",
          to: usuario.email,
          subject: "Necesitamos que vuelvas a verificar tu identidad",
          html: colbisnesEmailTemplate({
            preheader: "Tu verificación necesita una revisión",
            titulo: `Hola ${usuario.name || ""}, necesitamos tus documentos de nuevo`,
            cuerpo: `Revisamos tu solicitud de verificación y tuvimos problemas para validarla.<br/><br/>${motivo ? `<strong>Motivo:</strong> ${motivo}<br/><br/>` : ""}Por favor intenta de nuevo con fotos más claras y bien iluminadas. Asegúrate de que tu cédula sea legible y tu selfie muestre tu rostro completo.`,
            ctaTexto: "Reintentar verificación",
            ctaUrl: "https://colbisnes-web.vercel.app/kyc",
          }),
        }),
      });
    } catch (e) {
      console.error("Error enviando email de rechazo KYC:", e);
    }

    return NextResponse.json({ ok: true, mensaje: "KYC rechazado y usuario notificado" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
