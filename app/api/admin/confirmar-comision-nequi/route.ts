import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

function esAdmin(email?: string | null) {
  return !!email && email.toLowerCase() === process.env.ADMIN_EMAIL?.toLowerCase();
}

// El admin verifica manualmente (mirando su cuenta Nequi) que el comprador sí transfirió
// la comisión de reserva, y confirma aquí. Solo entonces se habilita el envío al vendedor.
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!esAdmin(session?.user?.email)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { orderId } = await req.json();
    if (!orderId) return NextResponse.json({ error: "orderId requerido" }, { status: 400 });

    const orden = await prisma.order.findUnique({ where: { id: orderId } });
    if (!orden) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
    if (orden.estado !== "ESPERANDO_COMISION") {
      return NextResponse.json({ error: "Esta orden no está esperando confirmación de comisión" }, { status: 400 });
    }

    // El producto debe seguir en PAYMENT_PENDING (estado que le puso /api/checkout/contra-entrega
    // al crear esta orden). Si ya no lo está —por ejemplo porque liberarProductosExpirados() lo
    // devolvió a AVAILABLE tras vencer el plazo, o porque ya está IN_ESCROW/SOLD por otra vía—
    // NO confirmamos a ciegas: podríamos reactivar una reserva vieja sobre un producto que ya
    // sigue otro camino (posiblemente vendido a otro comprador). Fail closed, no fail open.
    const producto = await prisma.product.findUnique({ where: { id: orden.productId } });
    if (!producto || producto.status !== "PAYMENT_PENDING") {
      return NextResponse.json(
        {
          error: `El producto ya no está en espera de pago (estado actual: ${producto?.status ?? "no encontrado"}). No se confirmó la comisión; verifica manualmente antes de continuar.`,
        },
        { status: 409 }
      );
    }

    // Solo aquí, con la comisión efectivamente confirmada por el admin, el producto entra a
    // IN_ESCROW de verdad (bug encontrado en auditoría 2026-07-06: antes esto pasaba en
    // contra-entrega/route.ts al crear la orden, sin que hubiera dinero real confirmado).
    await prisma.$transaction([
      prisma.order.update({
        where: { id: orderId },
        data: {
          estado: "ESPERANDO_ENVIO",
          comisionReservaPagada: true,
          comisionReservaConfirmadaAt: new Date(),
        },
      }),
      prisma.product.update({
        where: { id: orden.productId },
        data: { status: "IN_ESCROW", paidAt: new Date(), paymentExpiresAt: null },
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("POST /api/admin/confirmar-comision-nequi error:", err.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// Listado de órdenes esperando confirmación de comisión Nequi
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!esAdmin(session?.user?.email)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const ordenes = await prisma.order.findMany({
      where: { estado: "ESPERANDO_COMISION" },
      orderBy: { createdAt: "desc" },
    });

    const productIds = ordenes.map(o => o.productId);
    const productos = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, title: true, status: true, sellerId: true, seller: { select: { name: true, email: true } } },
    });
    const productosPorId = Object.fromEntries(productos.map(p => [p.id, p]));

    return NextResponse.json({
      ordenes: ordenes.map(o => ({
        id: o.id,
        productoTitulo: productosPorId[o.productId]?.title || "—",
        // Estado real del producto en este momento: debería ser siempre PAYMENT_PENDING
        // mientras la orden está ESPERANDO_COMISION. Si aparece otra cosa (AVAILABLE porque
        // expiró, IN_ESCROW/SOLD por otra vía), es una señal de que algo quedó inconsistente
        // y esta orden no debería confirmarse sin revisar manualmente primero.
        productoEstado: productosPorId[o.productId]?.status || null,
        vendedorNombre: productosPorId[o.productId]?.seller?.name || productosPorId[o.productId]?.seller?.email,
        buyerEmail: o.buyerEmail,
        comisionReservaCOP: o.comisionReservaCOP,
        comisionReservaComprobanteUrl: o.comisionReservaComprobanteUrl,
        comisionReservaReferencia: o.comisionReservaReferencia,
        createdAt: o.createdAt,
      })),
    });
  } catch (err: any) {
    console.error("GET /api/admin/confirmar-comision-nequi error:", err.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
