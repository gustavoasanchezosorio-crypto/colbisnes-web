import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: saber si el usuario marcó favorito y el total, O listar favoritos del usuario
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get("productId");
    const listAll = searchParams.get("list") === "true";
    const session = await getServerSession(authOptions);

    // Listar todos los favoritos del usuario autenticado
    if (listAll) {
      if (!session?.user?.id) return NextResponse.json({ favorites: [] });
      const favProductIds = await prisma.favorite.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        select: { productId: true },
      });
      const products = await prisma.product.findMany({
        where: { id: { in: favProductIds.map(f => f.productId) } },
        select: {
          id: true, title: true, description: true,
          priceCOP: true, city: true, status: true,
          images: { select: { url: true }, take: 1 },
        },
      });
      // Preserve favorites order
      const order = new Map(favProductIds.map((f, i) => [f.productId, i]));
      products.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      return NextResponse.json({ favorites: products });
    }

    if (!productId) return NextResponse.json({ error: "Falta productId" }, { status: 400 });

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { favoritesCount: true },
    });

    let esFavorito = false;
    if (session?.user?.id) {
      const fav = await prisma.favorite.findUnique({
        where: { userId_productId: { userId: session.user.id, productId } },
      });
      esFavorito = !!fav;
    }

    return NextResponse.json({ count: product?.favoritesCount || 0, esFavorito });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST: toggle favorito
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { productId } = await req.json();
    if (!productId) return NextResponse.json({ error: "Falta productId" }, { status: 400 });

    const existe = await prisma.favorite.findUnique({
      where: { userId_productId: { userId: session.user.id, productId } }
    });

    if (existe) {
      await prisma.favorite.delete({ where: { id: existe.id } });
      const p = await prisma.product.update({
        where: { id: productId },
        data: { favoritesCount: { decrement: 1 } },
        select: { favoritesCount: true }
      });
      return NextResponse.json({ esFavorito: false, count: Math.max(0, p.favoritesCount) });
    } else {
      await prisma.favorite.create({ data: { userId: session.user.id, productId } });
      const p = await prisma.product.update({
        where: { id: productId },
        data: { favoritesCount: { increment: 1 } },
        select: { favoritesCount: true }
      });
      return NextResponse.json({ esFavorito: true, count: p.favoritesCount });
    }
  } catch (e: any) {
    console.error("POST /api/favorites error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
