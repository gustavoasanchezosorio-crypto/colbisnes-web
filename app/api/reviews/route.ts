import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireKyc } from "@/lib/requireKyc";

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
    const { session, response: kycError } = await requireKyc();
    if (kycError) return kycError;

    const { productId, rating, comment } = await request.json();
    if (!productId || !rating || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: "productId y rating (1-5) son requeridos" },
        { status: 400 }
      );
    }

    const [product, order] = await Promise.all([
      prisma.product.findUnique({
        where: { id: productId },
        include: {
          seller: true,
          offers: { where: { status: "ACCEPTED" }, take: 1 },
        },
      }),
      prisma.order.findFirst({
        where: { productId, estado: { in: ["COMPLETADO", "ENTREGADO"] } },
        select: { buyerEmail: true },
      }),
    ]);

    if (!product || product.status !== "SOLD") {
      return NextResponse.json(
        { error: "El producto no está vendido o no existe" },
        { status: 400 }
      );
    }

    const acceptedOffer = product.offers[0];
    const isBuyerByOffer = acceptedOffer?.userId === session.user.id;
    const isBuyerByOrder = order?.buyerEmail?.toLowerCase() === session.user.email?.toLowerCase();
    const isBuyer = isBuyerByOffer || isBuyerByOrder;
    const isSeller = product.sellerId === session.user.id;

    if (!isBuyer && !isSeller) {
      return NextResponse.json(
        { error: "No tienes permiso para calificar esta transacción" },
        { status: 403 }
      );
    }

    // For reviews, toUserId is the other party
    // If buyer reviews, they rate the seller. If seller reviews, they rate the buyer (from offer or order).
    let toUserId: string;
    if (isBuyer) {
      toUserId = product.sellerId;
    } else {
      // seller reviewing buyer
      if (acceptedOffer) {
        toUserId = acceptedOffer.userId;
      } else {
        // find buyer user by email from order
        if (!order?.buyerEmail) {
          return NextResponse.json({ error: "No se encontró el comprador" }, { status: 400 });
        }
        const buyerUser = await prisma.user.findUnique({ where: { email: order.buyerEmail }, select: { id: true } });
        if (!buyerUser) return NextResponse.json({ error: "Comprador no encontrado" }, { status: 400 });
        toUserId = buyerUser.id;
      }
    }
    // (old line below removed, replaced above)
    const _unused = null;

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
