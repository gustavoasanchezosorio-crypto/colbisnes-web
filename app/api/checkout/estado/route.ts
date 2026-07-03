import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const orderId = req.nextUrl.searchParams.get("orderId");
    if (!orderId || orderId.length > 50) {
      return NextResponse.json({ error: "orderId requerido" }, { status: 400 });
    }

    const orden = await prisma.order.findUnique({ where: { id: orderId } });
    if (!orden) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });

    // Only the buyer or seller can view order status
    const product = await prisma.product.findUnique({
      where: { id: orden.productId },
      select: { sellerId: true },
    });
    const userId = session.user.id;
    const isParticipant =
      orden.buyerEmail === session.user.email || product?.sellerId === userId;

    if (!isParticipant) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    return NextResponse.json({
      estado: orden.estado,
      totalPagado: orden.totalPagado,
      numeroGuia: orden.numeroGuia,
      transportadora: orden.transportadora,
      comprobanteUrl: orden.comprobanteUrl,
      metodoPago: orden.metodoPago,
    });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
