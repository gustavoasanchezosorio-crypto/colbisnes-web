import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/audit";

function esAdmin(session: any) {
  return (
    session?.user?.role === "ADMIN" ||
    session?.user?.email?.toLowerCase() === process.env.ADMIN_EMAIL?.toLowerCase()
  );
}

// Endpoint de admin para corregir manualmente el status de un producto
// Útil cuando un pago fue rechazado pero el producto quedó en estado incorrecto
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !esAdmin(session)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { productId, nuevoStatus } = await req.json();
    if (!productId) return NextResponse.json({ error: "productId requerido" }, { status: 400 });

    const estadosValidos = ["AVAILABLE", "PAYMENT_PENDING", "IN_ESCROW", "SOLD"];
    if (!estadosValidos.includes(nuevoStatus)) {
      return NextResponse.json(
        { error: `nuevoStatus inválido. Válidos: ${estadosValidos.join(", ")}` },
        { status: 400 }
      );
    }

    const producto = await prisma.product.findUnique({ where: { id: productId } });
    if (!producto) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

    const actualizado = await prisma.product.update({
      where: { id: productId },
      data: {
        status: nuevoStatus,
        // Si vuelve a AVAILABLE, limpiar campos de pago
        ...(nuevoStatus === "AVAILABLE" && {
          paidAt: null,
          paymentExpiresAt: null,
          soldAt: null,
          acceptedOfferId: null,
        }),
      },
    });

    // Si el producto vuelve a AVAILABLE, rechazar ofertas pendientes para que el flujo sea limpio
    if (nuevoStatus === "AVAILABLE") {
      // No rechazamos las ofertas — el vendedor puede querer volver a aceptar una
    }

    console.log(`[ADMIN] Producto ${productId} cambiado de ${producto.status} a ${nuevoStatus} por ${session.user.email}`);

    await registrarAuditoria({
      userId: session.user.id,
      action: "CORREGIR_PRODUCTO",
      entity: "Product",
      entityId: productId,
      metadata: { statusAnterior: producto.status, statusNuevo: nuevoStatus },
      request: req,
    });

    return NextResponse.json({ ok: true, producto: actualizado });
  } catch (err: any) {
    console.error("POST /api/admin/corregir-producto error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
