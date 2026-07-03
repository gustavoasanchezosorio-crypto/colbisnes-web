import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params;
    const session = await getServerSession(authOptions);
    const isOwner = session?.user?.id === userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        city: true,
        image: true,
        createdAt: true,
        kycStatus: true,
        kycLevel: true,
        // Sensitive fields only visible to the account owner
        email: isOwner,
        phone: isOwner,
        nequiNumber: isOwner,
        brebId: isOwner,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const products = await prisma.product.findMany({
      where: { sellerId: userId, status: { in: ["AVAILABLE", "PAYMENT_PENDING", "IN_ESCROW"] } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        description: true,
        priceCOP: true,
        city: true,
        status: true,
        createdAt: true,
      },
    });

    const soldProducts = await prisma.product.findMany({
      where: { sellerId: userId, status: "SOLD" },
      orderBy: { soldAt: "desc" },
      select: {
        id: true,
        title: true,
        description: true,
        priceCOP: true,
        city: true,
        soldAt: true,
      },
    });

    const receivedReviews = await prisma.review.findMany({
      where: { toUserId: userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
        fromUser: { select: { name: true } },
        product: { select: { title: true } },
      },
    });

    const avgRating = receivedReviews.length
      ? receivedReviews.reduce((sum, r) => sum + r.rating, 0) / receivedReviews.length
      : 0;

    return NextResponse.json({
      ...user,
      products,
      soldProducts,
      receivedReviews,
      avgRating: Math.round(avgRating * 10) / 10,
      totalReviews: receivedReviews.length,
    });
  } catch (error) {
    console.error("GET /api/users/[id] error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
