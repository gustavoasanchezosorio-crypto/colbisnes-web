cat > app/api/payments/confirm-delivery/route.ts << 'EOF'
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

    if (product.status !== "IN_ESCROW") {
      return NextResponse.json(
        { error: "El producto no está en custodia" },
        { status: 400 }
      );
    }

    // Marcar como vendido
    const updated = await prisma.product.update({
      where: { id: productId },
      data: {
        status: "SOLD",
        soldAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, product: updated });
  } catch (error) {
    console.error("POST /api/payments/confirm-delivery error:", error);
    return NextResponse.json(
      { error: "Error interno" },
      { status: 500 }
    );
  }
}
EOF