import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { liberarProductosExpirados } from "@/lib/liberarExpirados";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await liberarProductosExpirados();
    const session = await getServerSession(authOptions);
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

    // El monto, mensaje e identidad de cada oferta son información sensible entre
    // comprador y vendedor (un competidor podía ver cuánto ofrecía cada quien, o
    // leer mensajes con datos personales) — antes CUALQUIER visitante, sin sesión
    // siquiera, recibía aquí la lista completa de ofertas de TODOS los
    // compradores con monto, mensaje y nombre (auditoría 2026-07-06). Ahora: el
    // vendedor sigue viendo todo (lo necesita para aceptar/rechazar); cada quien
    // ve el detalle completo de SU PROPIA oferta; y la oferta ya ACEPTADA (si no
    // sos ni el vendedor ni quien la hizo) solo expone el monto — sin mensaje ni
    // identidad — porque /checkout la necesita para cobrar el precio pactado, no
    // el precio de lista, cuando el vendedor aceptó una contraoferta.
    const esVendedor = session?.user?.id === product.sellerId;
    const miUserId = session?.user?.id;
    const offers = esVendedor
      ? product.offers
      : product.offers
          .filter((o) => o.userId === miUserId || o.id === product.acceptedOfferId)
          .map((o) =>
            o.userId === miUserId
              ? o
              : { id: o.id, productId: o.productId, amountCOP: o.amountCOP, status: o.status }
          );

    return NextResponse.json({ ...product, offers });
  } catch (error: any) {
    console.error("GET /api/products/[id] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
