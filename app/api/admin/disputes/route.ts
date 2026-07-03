import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

function esAdmin(email?: string | null) {
  return !!email && email.toLowerCase() === process.env.ADMIN_EMAIL?.toLowerCase();
}

// GET: lista disputas para el panel admin, filtrable por estado
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!esAdmin(session?.user?.email)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    const disputes = await prisma.dispute.findMany({
      where: status ? { status } : undefined,
      orderBy: [{ prioritaria: "desc" }, { createdAt: "desc" }],
      include: {
        raisedByUser: { select: { id: true, name: true, email: true } },
        raisedAgainstUser: { select: { id: true, name: true, email: true } },
        resolvedBy: { select: { id: true, name: true } },
      },
    });

    // Adjuntamos info de la orden y el producto para dar contexto sin exponer otro endpoint
    const orderIds = disputes.map(d => d.orderId);
    const orders = await prisma.order.findMany({ where: { id: { in: orderIds } } });
    const ordersById = Object.fromEntries(orders.map(o => [o.id, o]));

    const productIds = orders.map(o => o.productId);
    const products = await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, title: true, priceCOP: true } });
    const productsById = Object.fromEntries(products.map(p => [p.id, p]));

    const enriquecidas = disputes.map(d => {
      const order = ordersById[d.orderId];
      const product = order ? productsById[order.productId] : null;
      return { ...d, order, product };
    });

    return NextResponse.json({ disputes: enriquecidas });
  } catch (error) {
    console.error("Error listando disputas admin:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// PATCH: resuelve una disputa (a favor del comprador o del vendedor) o la marca en revisión
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!esAdmin(session?.user?.email) || !session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await req.json();
    const { disputeId, status, adminNotes } = body;

    const ESTADOS_VALIDOS = ["UNDER_REVIEW", "RESOLVED_BUYER", "RESOLVED_SELLER", "CANCELLED"];
    if (!disputeId || !ESTADOS_VALIDOS.includes(status)) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const dispute = await prisma.dispute.update({
      where: { id: disputeId },
      data: {
        status,
        adminNotes: adminNotes ?? undefined,
        resolvedById: status.startsWith("RESOLVED") || status === "CANCELLED" ? session.user.id : undefined,
        resolvedAt: status.startsWith("RESOLVED") || status === "CANCELLED" ? new Date() : undefined,
      },
    });

    // Si se resuelve a favor del vendedor, se puede liberar el pago manualmente desde el panel de pagos-pendientes.
    // Si se resuelve a favor del comprador, el admin debe procesar el reembolso desde Wompi manualmente (no automatizado por seguridad).

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "RESOLVE_DISPUTE",
        entity: "Dispute",
        entityId: disputeId,
        metadata: { status, adminNotes },
      },
    });

    return NextResponse.json({ ok: true, dispute });
  } catch (error) {
    console.error("Error resolviendo disputa:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
