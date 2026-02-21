import { prisma } from "./prisma";

/**
 * Libera automáticamente productos cuyo tiempo de pago ya venció.
 * Regla:
 * - Si status = PAYMENT_PENDING
 * - y paymentExpiresAt < ahora
 * → vuelve a AVAILABLE
 */
export async function releaseExpiredReservations() {
  const now = new Date();

  await prisma.product.updateMany({
    where: {
      status: "PAYMENT_PENDING",
      paymentExpiresAt: {
        not: null,
        lt: now,
      },
      paidAt: null,
      soldAt: null,
    },
    data: {
      status: "AVAILABLE",
      acceptedOfferId: null,
      paymentExpiresAt: null,
    },
  });
}