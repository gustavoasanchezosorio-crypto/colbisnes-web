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
      data: { kycStatus: "approved", kycLevel: 2, kycApprovedAt: new Date() },
      select: { email: true, name: true },
    });

    // Email verificación biometrica aprobada
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Colbisnes <hola@colbisnes.com>",
        to: usuario.email,
        subject: "Esta todo listo, haz tu primer Bisnes!",
        html: colbisnesEmailTemplate({
          preheader: "Ya puedes empezar a comprar y vender",
          titulo: `Hola ${usuario.name || ""}, todo listo! ✅`,
          cuerpo: `Verificamos tu identidad correctamente. Ya formas parte oficial de la comunidad Colbisnes.<br/><br/>Ahora puedes publicar productos, hacer ofertas y cerrar tus primeros negocios con total confianza.`,
          ctaTexto: "Ir a Colbisnes",
          ctaUrl: process.env.NEXT_PUBLIC_URL || "https://colbisnes.com",
        }),
      }),
    });

    await registrarAuditoria({
      userId: session.user.id,
      action: "APROBAR_KYC",
      entity: "User",
      entityId: userId,
      request: req,
    });

    return NextResponse.json({ success: true, mensaje: "Usuario verificado y notificado" });
  } catch (error: any) {
    console.error("Error aprobar KYC:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
