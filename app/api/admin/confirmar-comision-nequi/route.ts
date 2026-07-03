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

    await prisma.order.update({
      where: { id: orderId },
      data: {
        estado: "ESPERANDO_ENVIO",
        comisionReservaPagada: true,
        comisionReservaConfirmadaAt: new Date(),
      },
    });

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
      select: { id: true, title: true, sellerId: true, seller: { select: { name: true, email: true } } },
    });
    const productosPorId = Object.fromEntries(productos.map(p => [p.id, p]));

    return NextResponse.json({
      ordenes: ordenes.map(o => ({
        id: o.id,
        productoTitulo: productosPorId[o.productId]?.title || "—",
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
