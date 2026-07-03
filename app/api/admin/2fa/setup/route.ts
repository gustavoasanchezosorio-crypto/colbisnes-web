import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generarSecretoTOTP, generarOtpauthUri, verificarCodigoTOTP } from "@/lib/totp";

function esAdmin(email?: string | null) {
  return !!email && email.toLowerCase() === process.env.ADMIN_EMAIL?.toLowerCase();
}

// GET: devuelve el estado actual del 2FA. Si aún no está activado, genera (o reutiliza) un secreto
// pendiente para que el admin lo ingrese manualmente en Microsoft Authenticator.
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!esAdmin(session?.user?.email) || !session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

    if (user.totpEnabled) {
      return NextResponse.json({ enabled: true });
    }

    let secret = user.totpSecret;
    if (!secret) {
      secret = generarSecretoTOTP();
      await prisma.user.update({ where: { id: user.id }, data: { totpSecret: secret } });
    }

    const otpauthUri = generarOtpauthUri(secret, user.email);
    return NextResponse.json({ enabled: false, secret, otpauthUri });
  } catch (error) {
    console.error("Error en 2fa/setup GET:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// POST: confirma un código generado por la app autenticadora y activa el 2FA definitivamente.
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!esAdmin(session?.user?.email) || !session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { code } = await req.json();
    if (!code) return NextResponse.json({ error: "Falta el código" }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user?.totpSecret) {
      return NextResponse.json({ error: "Primero genera el secreto (GET /api/admin/2fa/setup)" }, { status: 400 });
    }

    if (!(await verificarCodigoTOTP(user.totpSecret, code))) {
      return NextResponse.json({ error: "Código inválido" }, { status: 400 });
    }

    await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: true } });

    await prisma.auditLog.create({
      data: { userId: user.id, action: "ENABLE_2FA", entity: "User", entityId: user.id },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error en 2fa/setup POST:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
