import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { productId } = body;

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

    if (product.status !== "PAYMENT_PENDING") {
      return NextResponse.json(
        { error: "El producto no está en proceso de pago" },
        { status: 400 }
      );
    }

    await prisma.product.update({
      where: { id: productId },
      data: {
        status: "SOLD",
        paidAt: new Date(),
        soldAt: new Date(),
        paymentExpiresAt: null,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Pago confirmado, producto vendido",
    });
  } catch (error) {
    console.error("Error confirmando pago:", error);
    return NextResponse.json(
      { error: "Error interno" },
      { status: 500 }
    );
  }
}