import { colbisnesEmailTemplate } from "@/lib/emailTemplate";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/audit";

function esAdmin(email: string) {
  return email?.toLowerCase() === process.env.ADMIN_EMAIL?.toLowerCase();
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !esAdmin(session.user.email)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    const { userId } = await req.json();
    if (!userId) return NextResponse.json({ error: "userId requerido" }, { status: 400 });

    const usuario = await prisma.user.update({
      where: { id: userId },
      data: { premiumStatus: "approved", premiumAprobadoAt: new Date() },
      select: { email: true, name: true },
    });

    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
        body: JSON.stringify({
          from: "Colbisnes <hola@colbisnes.com>",
          to: usuario.email,
          subject: "Ya tienes tu badge de verificación premium ⭐",
          html: colbisnesEmailTemplate({
            preheader: "Tu perfil ahora tiene verificación premium",
            titulo: `Felicidades ${usuario.name || ""}, tu verificación premium fue aprobada ⭐`,
            cuerpo: `Revisamos tus documentos y ya tienes el badge de verificación premium en tu perfil. Esto le da más confianza a tus compradores.`,
            ctaTexto: "Ver mi perfil",
            ctaUrl: process.env.NEXT_PUBLIC_URL || "https://colbisnes.com",
          }),
        }),
      });
    } catch (e) { console.error("Error enviando email de aprobación premium:", e); }

    await registrarAuditoria({
      userId: session.user.id,
      action: "APROBAR_PREMIUM",
      entity: "User",
      entityId: userId,
      request: req,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error aprobar premium:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
