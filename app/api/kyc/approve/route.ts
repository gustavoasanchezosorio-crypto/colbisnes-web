import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

    // Email verificacion biometrica aprobada
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
        html: `<div style="font-family:sans-serif;max-width:520px;margin:auto;padding:36px;background:#F0F4FF;border-radius:24px">
          <h1 style="color:#1F6BFF;text-align:center;font-size:28px;margin-bottom:4px">COLBISNES</h1>
          <p style="text-align:center;color:#64748B;font-size:13px;margin-bottom:28px">La mejor tienda de segunda mano de Colombia</p>
          <h2 style="color:#0F172A;font-size:22px">Hola ${usuario.name || ""}! 🛡️</h2>
          <p style="font-size:16px;color:#0F172A;font-weight:600">En Colbisnes somos muy mamones con la seguridad.</p>
          <p style="font-size:15px;color:#64748B">Por eso tu y todos nuestros usuarios deben hacer un registro biometrico.</p>
          <div style="background:#fff;border-radius:16px;padding:20px;margin:24px 0;border:1px solid #E2E8F5">
            <p style="font-size:22px;font-weight:900;color:#10B981;text-align:center;margin:0">Esta todo listo!</p>
            <p style="font-size:16px;color:#64748B;text-align:center;margin:8px 0 0">Haz tu primer Bisnes <span style="font-size:20px">®</span></p>
          </div>
          <div style="text-align:center;margin:28px 0">
            <a href="https://colbisnes-web.vercel.app" style="background:linear-gradient(135deg,#1448A3,#1F6BFF);color:white;padding:16px 36px;border-radius:24px;text-decoration:none;font-weight:700;font-size:16px">
              Ir a Colbisnes
            </a>
          </div>
          <p style="color:#94A3B8;font-size:12px;text-align:center">© 2026 Colbisnes - La mejor tienda de segunda mano de Colombia</p>
        </div>`,
      }),
    });

    return NextResponse.json({ success: true, mensaje: "Usuario verificado y notificado" });
  } catch (error: any) {
    console.error("Error aprobar KYC:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
