import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "userId es requerido" }, { status: 400 });
    }
    const reviews = await prisma.review.findMany({
      where: { toUserId: userId },
      orderBy: { createdAt: "desc" },
      include: {
        fromUser: { select: { name: true } },
        product: { select: { title: true, id: true } },
      },
    });
    const average = reviews.length
      ? reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length
      : 0;
    return NextResponse.json({
      reviews,
      average: Math.round(average * 10) / 10,
      count: reviews.length,
    });
  } catch (error) {
    console.error("GET /api/reviews error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { productId, rating, comment } = await request.json();
    if (!productId || !rating || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: "productId y rating (1-5) son requeridos" },
        { status: 400 }
      );
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        seller: true,
        offers: { where: { status: "ACCEPTED" }, take: 1 },
      },
    });

    if (!product || product.status !== "SOLD") {
      return NextResponse.json(
        { error: "El producto no está vendido o no existe" },
        { status: 400 }
      );
    }

    const acceptedOffer = product.offers[0];
    if (!acceptedOffer) {
      return NextResponse.json(
        { error: "No se encontró la oferta aceptada" },
        { status: 400 }
      );
    }

    const isBuyer = acceptedOffer.userId === session.user.id;
    const isSeller = product.sellerId === session.user.id;

    if (!isBuyer && !isSeller) {
      return NextResponse.json(
        { error: "No tienes permiso para calificar esta transacción" },
        { status: 403 }
      );
    }

    const toUserId = isBuyer ? product.sellerId : acceptedOffer.userId;

    const existing = await prisma.review.findUnique({
      where: {
        productId_fromUserId: {
          productId,
          fromUserId: session.user.id,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Ya has calificado esta transacción" },
        { status: 400 }
      );
    }

    const review = await prisma.review.create({
      data: {
        rating,
        comment,
        productId,
        fromUserId: session.user.id,
        toUserId,
      },
    });

    return NextResponse.json(review, { status: 201 });
  } catch (error) {
    console.error("POST /api/reviews error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
