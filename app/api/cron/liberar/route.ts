import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function handleRelease() {
  const now = new Date(); // ✅ DateTime correcto

  const expired = await prisma.product.findMany({
    where: {
      status: "PAYMENT_PENDING",
      paymentExpiresAt: { not: null, lt: now },
    },
    select: { id: true, acceptedOfferId: true },
  });

  if (expired.length === 0) return { released: 0 };

  await prisma.product.updateMany({
    where: { id: { in: expired.map((p) => p.id) } },
    data: {
      status: "AVAILABLE",
      acceptedOfferId: null,
      paymentExpiresAt: null,
    },
  });

  // Opcional: ofertas a REJECTED si aplica
  const offerIds = expired.map((p) => p.acceptedOfferId).filter(Boolean) as string[];
  if (offerIds.length > 0) {
    try {
      await prisma.offer.updateMany({
        where: { id: { in: offerIds } },
        data: { status: "REJECTED" as any },
      });
    } catch (e) {
      console.warn("No se pudo actualizar offers expiradas (opcional).", e);
    }
  }

  return { released: expired.length };
}

// ✅ Para cron real normalmente es POST
export async function POST() {
  try {
    const result = await handleRelease();
    return NextResponse.json(result);
  } catch (e) {
    console.error("POST /api/cron/liberar error:", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// ✅ Opcional, por si lo abres en el navegador
export async function GET() {
  try {
    const result = await handleRelease();
    return NextResponse.json(result);
  } catch (e) {
    console.error("GET /api/cron/liberar error:", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
