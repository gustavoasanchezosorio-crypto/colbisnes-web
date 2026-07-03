import { prisma } from "@/lib/prisma";

export interface TrustScoreResult {
  score: number; // 0-100
  label: "Nuevo" | "Básico" | "Confiable" | "Muy confiable" | "Élite";
  breakdown: {
    kyc: number;
    reviews: number;
    completedOrders: number;
    disputesPenalty: number;
    accountAge: number;
    penalizacionEnvios: number;
  };
  reviewsAvg: number | null;
  reviewsCount: number;
  completedOrdersCount: number;
  disputesAgainstResolvedCount: number;
}

function labelFor(score: number): TrustScoreResult["label"] {
  if (score >= 85) return "Élite";
  if (score >= 65) return "Muy confiable";
  if (score >= 40) return "Confiable";
  if (score >= 20) return "Básico";
  return "Nuevo";
}

// Calcula el score de confianza (0-100) de un usuario combinando:
// verificación de identidad, calificaciones recibidas, historial de pedidos
// completados sin disputa, disputas resueltas en su contra, y antigüedad de la cuenta.
export async function computeTrustScore(userId: string): Promise<TrustScoreResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, kycStatus: true, createdAt: true, penalizacionScorePts: true },
  });
  if (!user) throw new Error("Usuario no encontrado");

  // 1. KYC — hasta 30 puntos
  let kycPts = 0;
  if (user.kycStatus === "approved") kycPts = 30;
  else if (user.kycStatus === "pending") kycPts = 10;

  // 2. Calificaciones recibidas — hasta 25 puntos
  const reviewsAgg = await prisma.review.aggregate({
    where: { toUserId: userId },
    _avg: { rating: true },
    _count: { rating: true },
  });
  const reviewsAvg = reviewsAgg._avg.rating;
  const reviewsCount = reviewsAgg._count.rating;
  const reviewsPts = reviewsCount > 0 ? Math.round(((reviewsAvg || 0) / 5) * 25) : 0;

  // 3. Pedidos completados sin disputa (como vendedor o comprador) — hasta 20 puntos, 1 punto por pedido
  const productosVendidos = await prisma.product.findMany({ where: { sellerId: userId }, select: { id: true } });
  const productIds = productosVendidos.map(p => p.id);

  const [completadosVendedor, completadosComprador] = await Promise.all([
    productIds.length > 0
      ? prisma.order.count({ where: { productId: { in: productIds }, estado: "COMPLETADO" } })
      : Promise.resolve(0),
    prisma.order.count({ where: { buyerEmail: user.email, estado: "COMPLETADO" } }),
  ]);
  const completedOrdersCount = completadosVendedor + completadosComprador;
  const completedOrdersPts = Math.min(completedOrdersCount, 20);

  // 4. Disputas resueltas en su contra — penalización de 15 puntos cada una, hasta -30
  // Solo cuenta si el usuario perdió: fue vendedor y se resolvió a favor del comprador, o viceversa.
  const disputesLostRaw = await prisma.dispute.findMany({
    where: { raisedAgainstUserId: userId, status: { in: ["RESOLVED_BUYER", "RESOLVED_SELLER"] } },
    select: { status: true, raisedAgainstUserId: true, orderId: true },
  });
  let disputesLost = 0;
  for (const d of disputesLostRaw) {
    const orden = await prisma.order.findUnique({ where: { id: d.orderId }, select: { productId: true } });
    const productoDelAcusado = orden ? await prisma.product.findUnique({ where: { id: orden.productId }, select: { sellerId: true } }) : null;
    const acusadoEsVendedor = productoDelAcusado?.sellerId === userId;
    if ((acusadoEsVendedor && d.status === "RESOLVED_BUYER") || (!acusadoEsVendedor && d.status === "RESOLVED_SELLER")) {
      disputesLost++;
    }
  }
  const disputesPenalty = -Math.min(disputesLost * 15, 30);

  // 5. Antigüedad de la cuenta — hasta 5 puntos (1 punto por cada 2 meses, máx 5)
  const mesesDeCuenta = (Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24 * 30);
  const accountAgePts = Math.min(Math.floor(mesesDeCuenta / 2), 5);

  const base = 20; // puntos base por tener cuenta activa
  // Penalización acumulada por envíos tardíos en contraentrega (ver lib/accountBlock.ts y el cron
  // /api/cron/verificar-envios). Se guarda en el usuario porque, a diferencia de las disputas,
  // no hay un registro histórico separado del que recalcularla cada vez.
  const penalizacionEnvios = -(user.penalizacionScorePts || 0);
  const total = Math.max(0, Math.min(100, base + kycPts + reviewsPts + completedOrdersPts + disputesPenalty + accountAgePts + penalizacionEnvios));

  return {
    score: total,
    label: labelFor(total),
    breakdown: {
      kyc: kycPts,
      reviews: reviewsPts,
      completedOrders: completedOrdersPts,
      disputesPenalty,
      accountAge: accountAgePts,
      penalizacionEnvios,
    },
    reviewsAvg: reviewsAvg ?? null,
    reviewsCount,
    completedOrdersCount,
    disputesAgainstResolvedCount: disputesLost,
  };
}
