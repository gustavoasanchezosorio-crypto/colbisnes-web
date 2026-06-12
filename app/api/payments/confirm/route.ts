import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { productId } = body;

    if (!productId) {
      return NextResponse.json(
        { error: "productId is required" },
        { status: 400 }
      );
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      );
    }

    if (product.status !== "PAYMENT_PENDING") {
      return NextResponse.json(
        { error: "El producto no está en proceso de pago" },
        { status: 400 }
      );
    }

    // Marcar como vendido
    await prisma.product.update({
      where: { id: productId },
      data: {
        status: "SOLD",
        paidAt: new Date(),
        soldAt: new Date(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error en confirm payment:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
