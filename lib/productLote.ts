import { prisma } from "@/lib/prisma";

/**
 * "Varias unidades por publicación" (ver prisma/schema.prisma, campo Product.stockQuantity,
 * y el comentario largo en esa migración): un Product sigue representando una sola "ronda"
 * de venta, con el mismo lock de una transacción por fila que siempre tuvo (status,
 * paymentExpiresAt, etc. — ver confirm-delivery/webhook de Wompi/liberarExpirados, ninguno
 * de esos se tocó). Cuando esa ronda cubre varias unidades y queda stock después de
 * vender/entregar, esta función clona una fila Product nueva, AVAILABLE, con el resto —
 * en vez de intentar que varios compradores compitan por la misma fila a la vez.
 *
 * Se llama desde los dos lugares donde un producto puede terminar de venderse:
 *   - app/api/payments/confirm-delivery/route.ts (comprador confirma entrega → SOLD)
 *   - app/api/products/[id]/marcar-vendido/route.ts (vendedor marca venta externa → SOLD)
 *
 * NUNCA lanza: un fallo al republicar no debe tumbar la confirmación de venta/entrega que
 * ya ocurrió (el dinero ya se liberó o la venta externa ya quedó registrada). Si falla,
 * el vendedor simplemente tiene que volver a publicar a mano esta vez — se deja log.
 */
export async function republicarStockRestante(
  productId: string,
  cantidadVendida: number
): Promise<{ clonado: boolean; nuevoProductId?: string }> {
  try {
    const producto = await prisma.product.findUnique({
      where: { id: productId },
      include: { images: true },
    });
    if (!producto) return { clonado: false };

    const vendidas = Math.max(1, Math.floor(cantidadVendida) || 1);
    const restante = (producto.stockQuantity || 1) - vendidas;
    if (restante <= 0) return { clonado: false };

    const nuevo = await prisma.product.create({
      data: {
        title: producto.title,
        description: producto.description,
        priceCOP: producto.priceCOP,
        city: producto.city,
        condition: producto.condition,
        category: producto.category,
        status: "AVAILABLE",
        sellerId: producto.sellerId,
        tipoEntrega: producto.tipoEntrega,
        precioEnvio: producto.precioEnvio,
        pesoAprox: producto.pesoAprox,
        stockQuantity: restante,
        images: {
          create: producto.images.map((img) => ({ url: img.url })),
        },
      },
    });

    return { clonado: true, nuevoProductId: nuevo.id };
  } catch (err) {
    console.error("republicarStockRestante error (productId=" + productId + "):", err);
    return { clonado: false };
  }
}
