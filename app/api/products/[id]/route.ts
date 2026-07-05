import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        seller: { select: { id: true, name: true, image: true, kycStatus: true } }, // email omitido intencionalmente (privacidad)
        images: true,
        offers: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!product) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json(product);
  } catch (error: any) {
    console.error("GET /api/products/[id] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
