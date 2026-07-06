import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

function esAdmin(email: string) {
  return email?.toLowerCase() === process.env.ADMIN_EMAIL?.toLowerCase();
}

// Libera manualmente el pago al vendedor (flujo genérico: transferencia bancaria/Nequi/USDT
// hecha a mano por el admin fuera de la plataforma; txHash aquí es solo una referencia libre,
// no una transacción on-chain verificada). Antes esta ruta no validaba nada — cualquier orderId
// pasaba, sin importar el estado de la orden, y podía "liberarse" el mismo pago dos veces sin
// dejar rastro de quién lo hizo (auditoría 2026-07-06). Ahora exige que la entrega esté
// confirmada, rechaza si ya se había liberado, y deja un AuditLog igual que liberar-pago-auto.
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !esAdmin(session.user.email || "")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { orderId, txHash } = await req.json();
    if (!orderId) return NextResponse.json({ error: "orderId requerido" }, { status: 400 });

    const orden = await prisma.order.findUnique({ where: { id: orderId } });
    if (!orden) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
    if (orden.estado !== "COMPLETADO") {
      return NextResponse.json({ error: "La orden aún no está completada (entrega no confirmada)" }, { status: 400 });
    }
    if (orden.pagoLiberado) {
      return NextResponse.json({ error: "Este pago ya fue liberado" }, { status: 409 });
    }

    const [ordenActualizada] = await prisma.$transaction([
      prisma.order.update({
        where: { id: orderId },
        data: {
          pagoLiberado: true,
          pagoLiberadoAt: new Date(),
          txHashPago: txHash || null,
        },
      }),
      prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: "LIBERAR_PAGO_MANUAL",
          entity: "Order",
          entityId: orderId,
          metadata: { txHash: txHash || null },
        },
      }),
    ]);

    return NextResponse.json({ ok: true, orden: ordenActualizada });
  } catch (err: any) {
    console.error("Error en liberar-pago:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
