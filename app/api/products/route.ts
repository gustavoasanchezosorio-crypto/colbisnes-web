import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function releaseExpiredProducts() {
  const now = new Date();

  const expired = await prisma.product.findMany({
    where: {
      status: "PAYMENT_PENDING",
      paymentExpiresAt: { 
        not: null, 
        lt: now 
      },
    },
    select: {
      id: true,
      acceptedOfferId: true,
    },
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

  const expiredOfferIds = expired
    .map((p) => p.acceptedOfferId)
    .filter(Boolean) as string[];

  if (expiredOfferIds.length > 0) {
    try {
      await prisma.offer.updateMany({
        where: { id: { in: expiredOfferIds } },
        data: { status: "REJECTED" },
      });
    } catch (e) {
      console.warn("No se pudo actualizar ofertas expiradas", e);
    }
  }

  return { released: expired.length };
}

export async function GET() {
  try {
    await releaseExpiredProducts();

    const products = await prisma.product.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(products, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    console.error("GET /api/products error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
