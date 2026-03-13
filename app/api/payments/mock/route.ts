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
      return NextResponse.json({ error: "productId es requerido" }, { status: 400 });
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { seller: true },
    });

    if (!product) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }
    if (product.status !== "PAYMENT_PENDING") {
      return NextResponse.json({ error: "El producto no está pendiente de pago" }, { status: 400 });
    }

    const updated = await prisma.product.update({
      where: { id: productId },
      data: {
        status: "IN_ESCROW",
        paidAt: new Date(),
        paymentExpiresAt: null,
      },
    });

    // Notificar al vendedor con HTML plano
    try {
      const html = `<p>Hola ${product.seller.name || 'Vendedor'}, el comprador ha realizado el pago por tu producto <strong>${product.title}</strong> por $${product.priceCOP}. El dinero está en custodia. Confirma la entrega cuando sea el momento.</p>`;
      await sendEmail({
        to: product.seller.email,
        subject: 'Pago recibido por tu producto',
        html,
      });
    } catch (emailError) {
      console.error('Error enviando email de pago recibido:', emailError);
    }

    return NextResponse.json({ success: true, product: updated });
  } catch (error) {
    console.error("POST /api/payments/mock error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
