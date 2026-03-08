import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const { productId } = await request.json();

    if (!productId) {
      return NextResponse.json(
        { error: "productId es requerido" },
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
        { error: "El producto no está pendiente de pago" },
        { status: 400 }
      );
    }

    // Simular pago exitoso → pasa a IN_ESCROW
    const updated = await prisma.product.update({
      where: { id: productId },
      data: {
        status: "IN_ESCROW",
        paidAt: new Date(),
        paymentExpiresAt: null,
      },
    });

    return NextResponse.json({ success: true, product: updated });
  } catch (error) {
    console.error("POST /api/payments/mock error:", error);
    return NextResponse.json(
      { error: "Error interno" },
      { status: 500 }
    );
  }
}
