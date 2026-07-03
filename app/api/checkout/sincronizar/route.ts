import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Llamado desde la página de confirmación cuando Wompi redirige de vuelta.
// Si el pago fue rechazado o venció, libera el producto inmediatamente.
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { orderId } = await req.json();
    if (!orderId) return NextResponse.json({ error: "orderId requerido" }, { status: 400 });

    const orden = await prisma.order.findUnique({ where: { id: orderId } });
    if (!orden) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });

    // Solo el propio comprador puede sincronizar
    if (orden.buyerEmail.toLowerCase() !== session.user.email.toLowerCase()) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const producto = await prisma.product.findUnique({ where: { id: orden.productId } });
    if (!producto) return NextResponse.json({ ok: true, action: "none" });

    const estadosFinalesNegativos = ["RECHAZADO", "ANULADO", "ERROR"];
    const debeLiberar =
      estadosFinalesNegativos.includes(orden.estado) ||
      (orden.estado === "PENDIENTE" &&
        producto.paymentExpiresAt &&
        producto.paymentExpiresAt < new Date());

    if (debeLiberar && producto.status === "PAYMENT_PENDING") {
      // Liberar producto inmediatamente
      await prisma.$transaction([
        prisma.product.update({
          where: { id: orden.productId },
          data: {
            status: "AVAILABLE",
            acceptedOfferId: null,
            paymentExpiresAt: null,
          },
        }),
        // Marcar la orden como anulada si aún está pendiente
        ...(orden.estado === "PENDIENTE"
          ? [prisma.order.update({ where: { id: orderId }, data: { estado: "ANULADO" } })]
          : []),
        // Rechazar la oferta de compra directa que se creó automáticamente
        ...(producto.acceptedOfferId
          ? [prisma.offer.update({ where: { id: producto.acceptedOfferId }, data: { status: "REJECTED" } })]
          : []),
      ]);

      console.log(`[sincronizar] Producto ${orden.productId} liberado a AVAILABLE. Orden ${orderId} estado: ${orden.estado}`);
      return NextResponse.json({ ok: true, action: "liberado", estado: orden.estado, productId: orden.productId });
    }

    return NextResponse.json({ ok: true, action: "none", estado: orden.estado, productId: orden.productId });
  } catch (err: any) {
    console.error("POST /api/checkout/sincronizar error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
