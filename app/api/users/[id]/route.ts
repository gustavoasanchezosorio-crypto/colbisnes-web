import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Resolver la promesa de params
    const { id: userId } = await context.params;
    console.log("🔍 Iniciando GET /api/users/[id] para ID:", userId);

    if (!userId) {
      return NextResponse.json({ error: "ID de usuario no proporcionado" }, { status: 400 });
    }

    // 1. Obtener datos básicos del usuario
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
      },
    });

    if (!user) {
      console.log("❌ Usuario no encontrado");
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    console.log("✅ Usuario encontrado:", user.email);

    // 2. Obtener productos activos
    console.log("🔍 Buscando productos activos...");
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

    // 3. Obtener productos vendidos
    console.log("🔍 Buscando productos vendidos...");
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

    // 4. Obtener reseñas recibidas
    console.log("🔍 Buscando reseñas...");
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

    // 5. Calcular promedio
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
    return NextResponse.json(
      { error: "Error interno", details: error.message },
      { status: 500 }
    );
  }
}
