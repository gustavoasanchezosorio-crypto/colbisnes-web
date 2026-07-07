import { prisma } from "@/lib/prisma";

// Libera productos que quedaron en PAYMENT_PENDING con el plazo de pago vencido,
// de vuelta a AVAILABLE. Se llama tanto desde el cron diario (/api/cron/liberar,
// limitado a 1 vez al dia en el plan Hobby de Vercel) como "al vuelo" desde las
// rutas de lectura de productos, para que la liberacion sea casi inmediata sin
// depender solo del cron.
export async function liberarProductosExpirados() {
  const now = new Date();
  const expired = await prisma.product.findMany({
    where: {
      status: "PAYMENT_PENDING",
      paymentExpiresAt: { not: null, lt: now },
    },
    select: { id: true, acceptedOfferId: true },
  });

  if (expired.length === 0) return { released: 0 };

  const ids = expired.map((p) => p.id);

  await prisma.product.updateMany({
    where: { id: { in: ids } },
    data: { status: "AVAILABLE", acceptedOfferId: null, paymentExpiresAt: null },
  });

  const offerIds = expired.map((p) => p.acceptedOfferId).filter(Boolean) as string[];
  if (offerIds.length > 0) {
    try {
      await prisma.offer.updateMany({
        where: { id: { in: offerIds } },
        data: { status: "REJECTED" },
      });
    } catch (e) {
      console.warn("No se pudieron rechazar ofertas expiradas (opcional):", e);
    }
  }

  // Cancela cualquier orden USDT o contra-entrega (comisión Nequi) que haya quedado
  // esperando pago para estos productos, para que no siga apareciendo como "en curso" en
  // /api/orders/por-producto ni quede como orden zombie sin reconciliar (bug encontrado en
  // auditoría 2026-07-06: una orden ESPERANDO_COMISION podía quedar huérfana para siempre
  // porque ningún cron la tocaba una vez el producto volvía a AVAILABLE).
  try {
    await prisma.order.updateMany({
      where: { productId: { in: ids }, estado: { in: ["ESPERANDO_PAGO_CRYPTO", "ESPERANDO_COMISION"] } },
      data: { estado: "CANCELADO" },
    });
  } catch (e) {
    console.warn("No se pudieron cancelar órdenes crypto/comisión expiradas (opcional):", e);
  }

  // Aviso en tiempo real: quien esté viendo la ficha del producto lo ve volver a
  // "disponible" sin recargar (mismo canal `product-status-changed` que usa la
  // aceptación de oferta en app/api/offers/route.ts). `global.io` lo asigna server.js
  // una sola vez al arrancar; si no está (p.ej. en el cron fuera del proceso web),
  // simplemente se omite sin romper la liberación.
  try {
    const io = (global as any).io;
    if (io) {
      for (const id of ids) {
        io.to(`product-${id}`).emit("product-status-changed", { productId: id, status: "AVAILABLE" });
      }
    }
  } catch (e) {
    console.warn("No se pudo emitir product-status-changed al liberar (opcional):", e);
  }

  return { released: expired.length };
}
