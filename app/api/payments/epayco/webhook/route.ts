import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("Webhook Epayco recibido:", body);

    const { x_response, x_extra1, x_id_invoice } = body;
    const productId = x_extra1 || x_id_invoice;
    if (!productId) {
      return NextResponse.json({ error: "productId no encontrado" }, { status: 400 });
    }

    if (x_response === "Aceptada") {
      await prisma.product.update({
        where: { id: productId },
        data: {
          status: "IN_ESCROW",
          paidAt: new Date(),
          paymentExpiresAt: null,
        },
      });

      await prisma.offer.updateMany({
        where: { productId, status: "PENDING" },
        data: { status: "REJECTED" },
      });

      console.log(`Producto ${productId} actualizado a IN_ESCROW`);
    } else {
      console.log(`Pago no aprobado para producto ${productId}. Estado: ${x_response}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error en webhook Epayco:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
