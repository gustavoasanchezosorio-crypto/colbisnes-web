// lib/releaseExpired.ts
import { prisma } from "@/lib/prisma";

/**
 * Libera productos que quedaron en PAYMENT_PENDING y ya vencieron.
 * Reglas:
 * - status = PAYMENT_PENDING
 * - paymentExpiresAt != null
 * - paymentExpiresAt < now (now ES Date, NO number)
 */
export async function releaseExpiredProducts() {
  const now = new Date(); // ✅ DateTime real

  const expired = await prisma.product.findMany({
    where: {
      status: "PAYMENT_PENDING",
      paymentExpiresAt: {
        not: null,
        lt: now, // ✅ Date
      },
    },
    select: {
      id: true,
    },
  });

  if (expired.length === 0) {
    return { released: 0, ids: [] as string[] };
  }

  const ids = expired.map((p) => p.id);

  await prisma.product.updateMany({
    where: { id: { in: ids } },
    data: {
      status: "AVAILABLE",
      acceptedOfferId: null,
      paymentExpiresAt: null,
    },
  });

  return { released: ids.length, ids };
}