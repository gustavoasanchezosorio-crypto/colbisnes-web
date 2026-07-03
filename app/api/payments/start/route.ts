import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session?.user?.email) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { productId } = await req.json();

    if (!productId) {
      return NextResponse.json({ error: "productId requerido" }, { status: 400 });
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    if (product.status !== "AVAILABLE") {
      return NextResponse.json({ error: "El producto no está disponible" }, { status: 400 });
    }

    // Solo el comprador con la oferta aceptada puede iniciar el pago
    if (!product.acceptedOfferId) {
      return NextResponse.json({ error: "Este producto no tiene una oferta aceptada" }, { status: 403 });
    }

    const offer = await prisma.offer.findUnique({ where: { id: product.acceptedOfferId } });
    if (!offer || offer.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Solo el comprador con la oferta aceptada puede iniciar el pago" },
        { status: 403 }
      );
    }

    const expires = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.product.update({
      where: { id: productId },
      data: {
        status: "PAYMENT_PENDING",
        paymentExpiresAt: expires,
      },
    });

    return NextResponse.json({
      message: "Pago iniciado",
      expiresAt: expires,
    });
  } catch (error) {
    console.error("Error iniciando pago:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
