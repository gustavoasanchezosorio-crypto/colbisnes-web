import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        city: true,
        phone: true,
        image: true,
        createdAt: true,
        kycStatus: true,
        kycLevel: true,
        nequiNumber: true,
        brebId: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    // Obtener productos activos (siempre un array)
    const products = await prisma.product.findMany({
      where: { sellerId: userId, status: "AVAILABLE" },
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

    // Obtener productos vendidos
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

    // Obtener reseñas
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
    const errorMessage = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: "Error interno", details: errorMessage }, { status: 500 });
  }
}
