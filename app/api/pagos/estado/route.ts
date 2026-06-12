// app/api/pagos/estado/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { consultarTransaccion } from "@/lib/wompi";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const transactionId = searchParams.get("transactionId");
    const productId = searchParams.get("productId");

    if (!transactionId || !productId) {
      return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
    }

    // Consultar estado en Wompi
    const transaccion = await consultarTransaccion(transactionId);
    const estado = transaccion.status;

    // Si el pago fue aprobado, actualizar el producto a IN_ESCROW
    if (estado === "APPROVED") {
      const product = await prisma.product.findUnique({
        where: { id: productId },
      });

      if (product && product.status === "PAYMENT_PENDING") {
        await prisma.product.update({
          where: { id: productId },
          data: { status: "IN_ESCROW" },
        });

        // Registrar en auditoría
        await prisma.auditLog.create({
          data: {
            userId: session.user.id,
            action: "WOMPI_PAYMENT_APPROVED",
            details: `Pago Wompi aprobado. Transaction: ${transactionId}`,
          } as any,
        });
      }
    }

    // Si el pago fue rechazado, volver el producto a AVAILABLE
    if (estado === "DECLINED" || estado === "ERROR" || estado === "VOIDED") {
      await prisma.product.update({
        where: { id: productId },
        data: { status: "AVAILABLE" },
      });
    }

    return NextResponse.json({
      status: estado,
      aprobado: estado === "APPROVED",
      rechazado: ["DECLINED", "ERROR", "VOIDED"].includes(estado),
      pendiente: ["PENDING", "PROCESSING"].includes(estado),
    });
  } catch (error: any) {
    console.error("Error consultando estado:", error);
    return NextResponse.json(
      { error: error.message || "Error consultando pago" },
      { status: 500 }
    );
  }
}
