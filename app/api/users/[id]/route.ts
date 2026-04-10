import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params;
    console.log("🔍 Iniciando GET /api/users/[id] para ID:", userId);

    if (!userId) {
      return NextResponse.json({ error: "ID de usuario no proporcionado" }, { status: 400 });
    }

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
      },
    });

    if (!user) {
      console.log("❌ Usuario no encontrado");
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    console.log("✅ Usuario encontrado:", user.email);

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
    console.log(`✅ Productos activos encontrados: ${products.length}`);

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
    console.log(`✅ Productos vendidos encontrados: ${soldProducts.length}`);

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
    console.log(`✅ Reseñas encontradas: ${receivedReviews.length}`);

    const avgRating = receivedReviews.length
      ? receivedReviews.reduce((sum, r) => sum + r.rating, 0) / receivedReviews.length
      : 0;

    const response = {
      ...user,
      products,
      soldProducts,
      receivedReviews,
      avgRating: Math.round(avgRating * 10) / 10,
      totalReviews: receivedReviews.length,
    };

    console.log("✅ Respuesta preparada, enviando...");
    return NextResponse.json(response);
  } catch (error) {
    console.error("❌ ERROR en GET /api/users/[id]:", error);
    const errorMessage = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json(
      { error: "Error interno", details: errorMessage },
      { status: 500 }
    );
  }
}
