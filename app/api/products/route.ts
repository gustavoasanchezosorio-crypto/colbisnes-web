import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { bloqueoResponse } from "@/lib/accountBlock";
import { liberarProductosExpirados } from "@/lib/liberarExpirados";
import { requirePayoutInfo } from "@/lib/requirePayoutInfo";
import { requireEmailVerified } from "@/lib/requireEmailVerified";

export const dynamic = "force-dynamic";

const VALID_STATUSES = ["AVAILABLE", "PAYMENT_PENDING", "IN_ESCROW", "SOLD"] as const;
const VALID_CONDITIONS = ["NUEVO", "USADO", "REACONDICIONADO"] as const;

export async function GET(request: Request) {
  try {
    await liberarProductosExpirados();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "10", 10) || 10));
    const skip = (page - 1) * limit;
    const query = (searchParams.get("q") || searchParams.get("searchQuery") || "").slice(0, 200);
    const city = (searchParams.get("city") || "").slice(0, 100);
    const minPrice = searchParams.get("minPrice");
    const maxPrice = searchParams.get("maxPrice");
    const statusParam = searchParams.get("status") || "";
    const condition = (searchParams.get("condition") || "").slice(0, 50);
    const category = (searchParams.get("category") || "").slice(0, 100);

    const where: any = {};
    if (query) {
      where.OR = [
        { title: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
      ];
    }
    if (city) where.city = city;
    if (condition && (VALID_CONDITIONS as readonly string[]).includes(condition)) {
      where.condition = condition;
    }
    if (category) where.category = category;
    if (minPrice || maxPrice) {
      where.priceCOP = {};
      if (minPrice) where.priceCOP.gte = Math.max(0, parseInt(minPrice) || 0);
      if (maxPrice) where.priceCOP.lte = Math.min(1_000_000_000, parseInt(maxPrice) || 1_000_000_000);
    }
    if (statusParam && (VALID_STATUSES as readonly string[]).includes(statusParam)) {
      where.status = statusParam;
    }

    const products = await prisma.product.findMany({
      where,
      // Productos destacados (featuredUntil en el futuro) aparecen primero
      orderBy: [{ featuredUntil: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      skip,
      take: limit,
      include: {
        seller: {
          select: {
            id: true,
            name: true,
            city: true,
          },
        },
        images: { select: { url: true } },
        _count: { select: { offers: { where: { status: "PENDING" } } } },
        offers: {
          where: { status: "ACCEPTED" },
          select: { id: true, userId: true },
          take: 1,
        },
      },
    });

    // Batch-compute seller ratings with a single groupBy query instead of N+1
    const sellerIds = [...new Set(products.map((p) => p.seller.id))];
    const ratingsRaw = await prisma.review.groupBy({
      by: ["toUserId"],
      where: { toUserId: { in: sellerIds } },
      _avg: { rating: true },
      _count: { rating: true },
    });
    const ratingMap = new Map(
      ratingsRaw.map((r) => [
        r.toUserId,
        { avgRating: Math.round((r._avg.rating || 0) * 10) / 10, totalReviews: r._count.rating },
      ])
    );

    const productsWithRating = products.map((product) => ({
      ...product,
      seller: {
        ...product.seller,
        ...(ratingMap.get(product.seller.id) ?? { avgRating: 0, totalReviews: 0 }),
      },
      firstImage: product.images[0]?.url || null,
    }));

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
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Verificar que el vendedor haya completado el KYC
    const seller = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { kycStatus: true, antiPhishingCode: true },
    });
    if (!seller || seller.kycStatus !== "approved") {
      return NextResponse.json(
        { error: "Debes verificar tu identidad antes de publicar productos. Ve a /kyc para completar tu verificación.", kycRequired: true },
        { status: 403 }
      );
    }

    const bloqueo = await bloqueoResponse(session.user.id);
    if (bloqueo) return bloqueo;

    // El correo debe estar confirmado antes de publicar.
    const faltaVerif = await requireEmailVerified(session.user.id);
    if (faltaVerif) return faltaVerif;

    // El vendedor debe tener Nequi + BreB configurados para poder recibir el pago de su venta.
    const faltaPago = await requirePayoutInfo(session.user.id);
    if (faltaPago) return faltaPago;

    // Debe tener configurado su código anti-phishing: así puede distinguir los correos
    // legítimos de Colbisnes de intentos de suplantación antes de operar en la plataforma.
    if (!seller.antiPhishingCode || seller.antiPhishingCode.trim().length === 0) {
      return NextResponse.json(
        {
          error: "Debes crear tu código anti fraude en tu perfil antes de publicar. Ve a colbisnes.com/perfil/editar",
          antiPhishingRequired: true,
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { title, description, priceCOP, city, condition, category, images } = body;

    if (!title || typeof title !== "string" || title.trim().length < 3 || title.length > 200) {
      return NextResponse.json({ error: "Título inválido (3-200 caracteres)" }, { status: 400 });
    }
    if (!description || typeof description !== "string" || description.trim().length < 10 || description.length > 5000) {
      return NextResponse.json({ error: "Descripción inválida (10-5000 caracteres)" }, { status: 400 });
    }
    if (typeof priceCOP !== "number" || priceCOP < 1000 || priceCOP > 1_000_000_000) {
      return NextResponse.json({ error: "Precio inválido (mínimo $1.000 COP)" }, { status: 400 });
    }
    if (!city || typeof city !== "string" || city.length > 100) {
      return NextResponse.json({ error: "Ciudad inválida" }, { status: 400 });
    }
    if (images && (!Array.isArray(images) || images.length > 10)) {
      return NextResponse.json({ error: "Máximo 10 imágenes" }, { status: 400 });
    }
    const validImageUrls = (images as string[] | undefined)?.filter(
      (url) => typeof url === "string" && url.startsWith("https://res.cloudinary.com/")
    );

    const finalCondition = (VALID_CONDITIONS as readonly string[]).includes(condition)
      ? condition
      : "USADO";

    const product = await prisma.product.create({
      data: {
        title: title.trim(),
        description: description.trim(),
        priceCOP,
        city: city.trim(),
        condition: finalCondition,
        category: (typeof category === "string" && category.length <= 100) ? category : "Otros",
        status: "AVAILABLE",
        sellerId: session.user.id,
        images: validImageUrls?.length
          ? { create: validImageUrls.map((url) => ({ url })) }
          : undefined,
      },
      include: { images: true },
    });

    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    console.error("Error en POST /api/products:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
