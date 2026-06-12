import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function releaseExpiredProducts() {
  const now = new Date();
  const expired = await prisma.product.findMany({
    where: {
      status: "PAYMENT_PENDING",
      paymentExpiresAt: { not: null, lt: now },
    },
    select: { id: true, acceptedOfferId: true },
  });
  if (expired.length === 0) return { released: 0 };
  await prisma.product.updateMany({
    where: { id: { in: expired.map(p => p.id) } },
    data: { status: "AVAILABLE", acceptedOfferId: null, paymentExpiresAt: null },
  });
  const expiredOfferIds = expired.map(p => p.acceptedOfferId).filter(Boolean) as string[];
  if (expiredOfferIds.length > 0) {
    try {
      await prisma.offer.updateMany({
        where: { id: { in: expiredOfferIds } },
        data: { status: "REJECTED" },
      });
    } catch (e) { console.warn("No se pudo actualizar ofertas expiradas", e); }
  }
  return { released: expired.length };
}

export async function GET(request: Request) {
  try {
    await releaseExpiredProducts();
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") || "";
    const city = searchParams.get("city") || "";
    const minPrice = searchParams.get("minPrice");
    const maxPrice = searchParams.get("maxPrice");
    const status = searchParams.get("status") || "";
    const condition = searchParams.get("condition") || "";

    const where: any = {};
    if (query) {
      where.OR = [
        { title: { contains: query } },
        { description: { contains: query } },
      ];
    }
    if (city) where.city = city;
    if (condition) where.condition = condition;
    if (minPrice || maxPrice) {
      where.priceCOP = {};
      if (minPrice) where.priceCOP.gte = parseInt(minPrice);
      if (maxPrice) where.priceCOP.lte = parseInt(maxPrice);
    }
    if (status && ["AVAILABLE", "PAYMENT_PENDING", "IN_ESCROW", "SOLD"].includes(status)) {
      where.status = status;
    }

    const products = await prisma.product.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        seller: {
          select: {
            id: true,
            name: true,
            city: true,
            receivedReviews: { select: { rating: true } },
          },
        },
        images: { select: { url: true }, take: 1 },
        _count: { select: { offers: true } },
      },
    });

    const productsWithRating = products.map(product => {
      const reviews = product.seller.receivedReviews;
      const avgRating = reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;
      return {
        ...product,
        seller: {
          ...product.seller,
          avgRating: Math.round(avgRating * 10) / 10,
          totalReviews: reviews.length,
        },
        firstImage: product.images[0]?.url || null,
      };
    });
    return NextResponse.json(productsWithRating, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    console.error("Error en GET /api/products:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const { title, description, priceCOP, city, condition, images } = body;

    const finalCondition = condition || "USADO";
    if (!title || !description || !priceCOP || !city) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
    }
    if (typeof priceCOP !== "number" || priceCOP <= 0) {
      return NextResponse.json({ error: "Precio invalido" }, { status: 400 });
    }

    console.log("Creating product with images:", JSON.stringify(images));
    const product = await prisma.product.create({
      data: {
        title,
        description,
        priceCOP,
        city,
        condition: finalCondition,
        status: "AVAILABLE",
        sellerId: session.user.id,
        images: images?.length ? {
          create: images.map((url: string) => ({ url })),
        } : undefined,
      },
      include: { images: true },
    });

    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    console.error("Error en POST /api/products:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
