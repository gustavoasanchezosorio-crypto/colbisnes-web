import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sendEmail } from '@/lib/email';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { productId } = await request.json();
    if (!productId) {
      return NextResponse.json({ error: "productId requerido" }, { status: 400 });
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        seller: true,
        offers: { where: { status: "ACCEPTED" }, include: { user: true } },
      },
    });

    if (!product) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }
    if (product.status !== "IN_ESCROW") {
      return NextResponse.json({ error: "El producto no está en custodia" }, { status: 400 });
    }
    if (product.sellerId !== session.user.id) {
      return NextResponse.json({ error: "No eres el vendedor" }, { status: 403 });
    }

    // Marcar como vendido
    const updated = await prisma.product.update({
      where: { id: productId },
      data: { status: "SOLD", soldAt: new Date() },
    });

    // Rechazar otras ofertas pendientes
    await prisma.offer.updateMany({
      where: { productId, status: "PENDING" },
      data: { status: "REJECTED" },
    });

    // Obtener el comprador (la oferta aceptada)
    const acceptedOffer = product.offers[0];
    if (acceptedOffer && acceptedOffer.user) {
      try {
        const html = `<p>Hola ${acceptedOffer.user.name || 'Comprador'}, el vendedor ha confirmado la entrega de <strong>${product.title}</strong> por $${product.priceCOP}. ¡La compra está completa! Califica al vendedor.</p>`;
        await sendEmail({
          to: acceptedOffer.user.email,
          subject: '¡Tu compra está completa!',
          html,
        });
      } catch (emailError) {
        console.error('Error enviando email de venta finalizada:', emailError);
      }
    }

    return NextResponse.json({ success: true, product: updated });
  } catch (error) {
    console.error("POST /api/payments/confirm-delivery error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
