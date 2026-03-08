import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");
    if (!productId) return NextResponse.json({ error: "productId is required" }, { status: 400 });

    const offers = await prisma.offer.findMany({
      where: { productId },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true } } },
    });
    return NextResponse.json(offers);
  } catch (error) {
    console.error("GET /api/offers error:", error);
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
    const { productId, amountCOP, message } = body;
    if (!productId || !amountCOP) {
      return NextResponse.json({ error: "productId y amountCOP requeridos" }, { status: 400 });
    }

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product || product.status !== "AVAILABLE") {
      return NextResponse.json({ error: "Producto no disponible" }, { status: 400 });
    }
    if (product.sellerId === session.user.id) {
      return NextResponse.json({ error: "No puedes ofertar tu propio producto" }, { status: 400 });
    }

    if (Number(amountCOP) > Number(product.priceCOP)) {
      return NextResponse.json({ error: "La oferta no puede ser mayor al precio del producto" }, { status: 400 });
    }

    const offer = await prisma.offer.create({
      data: {
        productId,
        amountCOP: Number(amountCOP),
        message,
        status: "PENDING",
        userId: session.user.id,
      },
    });

    return NextResponse.json(offer, { status: 201 });
  } catch (error) {
    console.error("POST /api/offers error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const { offerId, status } = body;
    if (!offerId || !status || !["ACCEPTED", "REJECTED"].includes(status)) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
      include: { product: true },
    });

    if (!offer) {
      return NextResponse.json({ error: "Oferta no encontrada" }, { status: 404 });
    }
    if (offer.status !== "PENDING") {
      return NextResponse.json({ error: "La oferta ya no está pendiente" }, { status: 400 });
    }
    if (offer.product.sellerId !== session.user.id) {
      return NextResponse.json({ error: "No tienes permiso" }, { status: 403 });
    }

    if (status === "REJECTED") {
      await prisma.offer.update({ where: { id: offerId }, data: { status: "REJECTED" } });
      return NextResponse.json({ success: true, status: "REJECTED" });
    }

    if (offer.product.status !== "AVAILABLE") {
      return NextResponse.json({ error: "Producto no disponible" }, { status: 400 });
    }

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const result = await prisma.$transaction(async (tx) => {
      const updatedOffer = await tx.offer.update({
        where: { id: offerId },
        data: { status: "ACCEPTED" },
      });
      const updatedProduct = await tx.product.update({
        where: { id: offer.productId },
        data: {
          status: "PAYMENT_PENDING",
          acceptedOfferId: offerId,
          paymentExpiresAt: expiresAt,
        },
      });
      return { updatedOffer, updatedProduct };
    });

    return NextResponse.json({ success: true, status: "ACCEPTED", product: result.updatedProduct });
  } catch (error) {
    console.error("PATCH /api/offers error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
