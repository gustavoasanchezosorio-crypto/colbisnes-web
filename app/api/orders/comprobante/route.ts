import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generarComprobantePDF } from "@/lib/comprobante";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Descarga del comprobante de la transacción en PDF. Solo el comprador o el vendedor
// de la orden pueden generarlo. Se arma en el momento a partir de los datos de la orden
// (mismo generador que se adjunta por correo al finalizar la transacción).
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const orderId = req.nextUrl.searchParams.get("orderId");
    if (!orderId) return NextResponse.json({ error: "orderId requerido" }, { status: 400 });

    const orden = await prisma.order.findUnique({ where: { id: orderId } });
    if (!orden) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });

    // La comisión de reserva sin pagar significa que todavía no hay transacción real.
    if (orden.estado === "ESPERANDO_COMISION") {
      return NextResponse.json({ error: "La transacción aún no tiene un pago confirmado" }, { status: 409 });
    }

    const producto = await prisma.product.findUnique({
      where: { id: orden.productId },
      include: { seller: { select: { id: true, name: true, email: true } } },
    });
    if (!producto) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

    const esVendedor = producto.seller?.id === session.user.id;
    const esComprador = orden.buyerEmail.toLowerCase() === session.user.email.toLowerCase();
    if (!esVendedor && !esComprador) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const comprador = await prisma.user.findUnique({
      where: { email: orden.buyerEmail },
      select: { name: true },
    });

    const pdf = await generarComprobantePDF({
      ordenId: orden.id,
      fecha: orden.createdAt,
      estado: orden.estado,
      metodoPago: orden.metodoPago,
      productoTitulo: producto.title,
      compradorEmail: orden.buyerEmail,
      compradorNombre: comprador?.name,
      vendedorNombre: producto.seller?.name,
      vendedorEmail: producto.seller?.email,
      comision: orden.comision,
      recibeVendedor: orden.recibeVendedor,
      envioCobrado: orden.envioCobrado,
      totalPagado: orden.totalPagado,
      numeroGuia: orden.numeroGuia,
      transportadora: orden.transportadora,
    });

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="comprobante-colbisnes-${orden.id.slice(-8)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    console.error("GET /api/orders/comprobante error:", err.message);
    return NextResponse.json({ error: "No se pudo generar el comprobante" }, { status: 500 });
  }
}
