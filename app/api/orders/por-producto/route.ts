import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const productId = req.nextUrl.searchParams.get("productId");
    if (!productId) return NextResponse.json({ error: "productId requerido" }, { status: 400 });

    const orden = await prisma.order.findFirst({
      where: {
        productId,
        estado: { in: ["PAGADO", "ESPERANDO_COMISION", "ESPERANDO_ENVIO", "EN_CAMINO", "ENTREGADO", "COMPLETADO", "ESPERANDO_PAGO_CRYPTO"] },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!orden) return NextResponse.json({ orden: null });

    // Solo el vendedor o el comprador pueden ver los detalles de la orden
    const producto = await prisma.product.findUnique({ where: { id: productId }, select: { sellerId: true } });
    const esVendedor = producto?.sellerId === session.user.id;
    const esComprador = orden.buyerEmail.toLowerCase() === session.user.email.toLowerCase();

    if (!esVendedor && !esComprador) {
      // Terceros solo ven el estado — sin email, monto, guía de envío ni transportadora
      return NextResponse.json({
        orden: {
          id: orden.id,
          estado: orden.estado,
        },
      });
    }

    return NextResponse.json({
      orden: {
        id: orden.id,
        estado: orden.estado,
        totalPagado: orden.totalPagado,
        buyerEmail: orden.buyerEmail,
        metodoPago: orden.metodoPago,
        codigoSecreto: esComprador ? orden.codigoSecreto : undefined,
        numeroGuia: orden.numeroGuia,
        transportadora: orden.transportadora,
        comprobanteUrl: orden.comprobanteUrl,
        comisionReservaCOP: orden.comisionReservaCOP,
        comisionReservaPagada: orden.comisionReservaPagada,
        comisionReservaComprobanteUrl: esComprador ? orden.comisionReservaComprobanteUrl : undefined,
        fechaLimiteEnvio: orden.fechaLimiteEnvio,
        envioPenalizado: orden.envioPenalizado,
        nequiNumero: process.env.COLBISNES_NEQUI_NUMERO || null,
      },
    });
  } catch (err: any) {
    console.error("GET /api/orders/por-producto error:", err.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
