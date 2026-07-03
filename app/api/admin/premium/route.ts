import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { colbisnesEmailTemplate } from "@/lib/emailTemplate";

function esAdmin(email: string) {
  return email?.toLowerCase() === process.env.ADMIN_EMAIL?.toLowerCase();
}

// GET: listar solicitudes de badge premium por estado
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !esAdmin(session.user.email)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const filtro = searchParams.get("status") || "pending";

    const usuarios = await prisma.user.findMany({
      where: { premiumStatus: filtro },
      orderBy: { premiumSolicitadoAt: "desc" },
      take: 50,
      select: {
        id: true, name: true, email: true,
        premiumStatus: true, premiumSolicitadoAt: true, premiumAprobadoAt: true, premiumRechazadoAt: true,
        premiumCedulaUrl: true, premiumComprobanteUrl: true,
      },
    });

    return NextResponse.json({ usuarios });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: rechazar solicitud premium
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
      data: { premiumStatus: "rejected", premiumRechazadoAt: new Date() },
      select: { email: true, name: true },
    });

    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
        body: JSON.stringify({
          from: "Colbisnes <hola@colbisnes.com>",
          to: usuario.email,
          subject: "Tu solicitud de verificación premium",
          html: colbisnesEmailTemplate({
            preheader: "Necesitamos revisar tu solicitud de nuevo",
            titulo: `Hola ${usuario.name || ""}, tu badge premium necesita otra revisión`,
            cuerpo: `${motivo ? `<strong>Motivo:</strong> ${motivo}<br/><br/>` : ""}Puedes volver a intentarlo desde tu perfil con documentos más claros.`,
            ctaTexto: "Ir a mi perfil",
            ctaUrl: "https://colbisnes-web.vercel.app/perfil/editar",
          }),
        }),
      });
    } catch (e) { console.error("Error enviando email de rechazo premium:", e); }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
