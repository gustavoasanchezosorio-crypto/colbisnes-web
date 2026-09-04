import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/audit";
import { verificarCodigoTOTP } from "@/lib/totp";
import { esAdminSession } from "@/lib/adminAuth";

// Igual que el resto de rutas admin — ver el comentario en app/api/admin/usuarios/[id]/route.ts.
export const dynamic = "force-dynamic";

// Lista usuarios bloqueados (por tiempo) o con deuda pendiente por envío tardío en contraentrega.
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!esAdminSession(session)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const usuarios = await prisma.user.findMany({
      where: {
        OR: [
          { blockedUntil: { not: null } },
          { deudaPendienteCOP: { gt: 0 } },
        ],
      },
      select: {
        id: true, name: true, email: true, phone: true,
        blockedUntil: true, blockedReason: true, deudaPendienteCOP: true, penalizacionScorePts: true,
      },
      orderBy: { blockedUntil: "desc" },
    });

    return NextResponse.json({ usuarios }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (err: any) {
    console.error("GET /api/admin/usuarios-bloqueados error:", err.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// Acciones del admin sobre un usuario bloqueado:
//  - "pagar-deuda": el vendedor ya le pagó a Colbisnes (por fuera del sistema) la deuda pendiente.
//  - "levantar-bloqueo": levanta el bloqueo por tiempo manualmente (caso excepcional).
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!esAdminSession(session) || !session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { userId, accion, code } = await req.json();
    if (!userId || !accion) return NextResponse.json({ error: "userId y accion requeridos" }, { status: 400 });
    if (!code) return NextResponse.json({ error: "Falta el código 2FA" }, { status: 400 });

    // Step-up 2FA: marcar una deuda como pagada o levantar un bloqueo son acciones sensibles
    // (afectan cobros y sanciones), así que exigen un código TOTP vigente igual que liberar-pago.
    const admin = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!admin?.totpEnabled || !admin.totpSecret) {
      return NextResponse.json({ error: "El 2FA no está activado. Configúralo en /admin/2fa" }, { status: 400 });
    }
    if (!(await verificarCodigoTOTP(admin.totpSecret, code))) {
      return NextResponse.json({ error: "Código de verificación inválido" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

    if (accion === "pagar-deuda") {
      await prisma.user.update({
        where: { id: userId },
        data: { deudaPendienteCOP: 0 },
      });
      await prisma.blacklist.updateMany({
        where: { email: user.email, activo: true },
        data: { activo: false, deudaPendienteCOP: 0 },
      });
      await registrarAuditoria({
        userId: session!.user!.id,
        action: "PAGAR_DEUDA",
        entity: "User",
        entityId: userId,
        metadata: { deudaAnteriorCOP: user.deudaPendienteCOP },
        request: req,
      });
      return NextResponse.json({ ok: true, mensaje: "Deuda marcada como pagada" });
    }

    if (accion === "levantar-bloqueo") {
      await prisma.user.update({
        where: { id: userId },
        data: { blockedUntil: null, blockedReason: null },
      });
      await registrarAuditoria({
        userId: session!.user!.id,
        action: "LEVANTAR_BLOQUEO",
        entity: "User",
        entityId: userId,
        metadata: { motivoAnterior: user.blockedReason },
        request: req,
      });
      return NextResponse.json({ ok: true, mensaje: "Bloqueo por tiempo levantado" });
    }

    return NextResponse.json({ error: "Acción no reconocida" }, { status: 400 });
  } catch (err: any) {
    console.error("POST /api/admin/usuarios-bloqueados error:", err.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
