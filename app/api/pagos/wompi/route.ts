// app/api/pagos/wompi/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  crearTransaccionWompi,
  generarReferencia,
  copACentavos,
} from "@/lib/wompi";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { productId, offerId, phoneNumber, metodoPago } = await req.json();

    if (!productId || !offerId) {
      return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
    }

    // Buscar el producto y la oferta
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { seller: true },
    });

    if (!product) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    if (product.status !== "PAYMENT_PENDING") {
      return NextResponse.json(
        { error: "El producto no está en estado de pago pendiente" },
        { status: 400 }
      );
    }

    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
    });

    if (!offer || offer.status !== "ACCEPTED") {
      return NextResponse.json({ error: "Oferta no válida" }, { status: 400 });
    }

    // Monto a pagar (precio del producto o monto de la oferta)
    const monto = offer.amountCOP || product.priceCOP;
    const referencia = generarReferencia(productId, session.user.id);

    // Construir método de pago según tipo
    let paymentMethod: any;

    if (metodoPago === "NEQUI") {
      if (!phoneNumber) {
        return NextResponse.json(
          { error: "Se requiere número de teléfono para Nequi" },
          { status: 400 }
        );
      }
      paymentMethod = {
        type: "NEQUI",
        phone_number: phoneNumber.replace(/\D/g, ""),
      };
    } else {
      return NextResponse.json(
        { error: "Método de pago no soportado aún. Usa NEQUI." },
        { status: 400 }
      );
    }

    // Crear la transacción en Wompi
    const transaccion = await crearTransaccionWompi({
      amountInCents: copACentavos(Number(monto)),
      currency: "COP",
      customerEmail: session.user.email!,
      reference: referencia,
      paymentMethod,
    });

    // Guardar referencia en el producto para seguimiento
    await prisma.product.update({
      where: { id: productId },
      data: {
        wompiTransactionId: transaccion.id,
        wompiReference: referencia,
      } as any,
    });

    return NextResponse.json({
      success: true,
      transactionId: transaccion.id,
      referencia,
      status: transaccion.status,
      mensaje:
        metodoPago === "NEQUI"
          ? "Revisa tu app de Nequi para aprobar el pago"
          : "Pago iniciado",
    });
  } catch (error: any) {
    console.error("Error Wompi:", error);
    return NextResponse.json(
      { error: error.message || "Error procesando el pago" },
      { status: 500 }
    );
  }
}
