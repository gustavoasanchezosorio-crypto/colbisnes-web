import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { productId } = await req.json();

    if (!productId) {
      return NextResponse.json(
        { error: "productId requerido" },
        { status: 400 }
      );
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      return NextResponse.json(
        { error: "Producto no encontrado" },
        { status: 404 }
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
    return NextResponse.json(
      { error: "Error interno" },
      { status: 500 }
    );
  }
}