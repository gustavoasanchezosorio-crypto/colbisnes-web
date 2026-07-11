import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { crearTransaccionWompi } from "@/lib/wompi";

// Cobro de la COMISIÓN DE RESERVA (contra-entrega) directo por Nequi (push a la app del comprador).
// Usa la referencia con prefijo "comision" para que el webhook la enrute a procesarWebhookComision
// (comisión pagada + producto IN_ESCROW), con la misma verificación cruzada de monto.
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const orderId: string = body.orderId || "";
    const telefonoRaw: string = String(body.telefono || "");
    if (!orderId) return NextResponse.json({ error: "orderId requerido" }, { status: 400 });

    const orden = await prisma.order.findUnique({ where: { id: orderId } });
    if (!orden) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
    if (orden.buyerEmail.toLowerCase() !== session.user.email.toLowerCase()) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    if (orden.estado !== "ESPERANDO_COMISION") {
      return NextResponse.json({ error: "Esta orden no está esperando el pago de la comisión" }, { status: 400 });
    }
    if (orden.comisionReservaPagada) {
      return NextResponse.json({ error: "La comisión de esta orden ya fue pagada" }, { status: 400 });
    }
    if (!orden.comisionReservaCOP || orden.comisionReservaCOP <= 0) {
      return NextResponse.json({ error: "Esta orden no tiene una comisión válida por cobrar" }, { status: 400 });
    }

    const producto = await prisma.product.findUnique({ where: { id: orden.productId } });
    if (!producto || producto.status !== "PAYMENT_PENDING") {
      return NextResponse.json({ error: `El producto ya no está reservado para este pedido (estado: ${producto?.status ?? "no encontrado"}).` }, { status: 409 });
    }

    const usuario = await prisma.user.findUnique({ where: { email: session.user.email }, select: { nequiNumber: true } });
    const telefono = (telefonoRaw || usuario?.nequiNumber || "").replace(/\D/g, "").slice(-10);
    if (telefono.length !== 10) {
      return NextResponse.json({ error: "Ingresa un número Nequi válido de 10 dígitos" }, { status: 400 });
    }

    const referencia = "comision" + orden.id.replace(/[^a-zA-Z0-9]/g, "") + Date.now();
    const amountInCents = Math.round(orden.comisionReservaCOP * 100);

    await prisma.order.update({ where: { id: orden.id }, data: { comisionReservaReferencia: referencia } });

    const tx = await crearTransaccionWompi({
      amountInCents,
      currency: "COP",
      customerEmail: session.user.email,
      reference: referencia,
      paymentMethod: { type: "NEQUI", phone_number: telefono },
    });

    return NextResponse.json({ ok: true, transactionId: tx.id, status: tx.status, orderId: orden.id });
  } catch (err: any) {
    console.error("Error en cobro Nequi comisión:", err.message);
    return NextResponse.json({ error: "No se pudo iniciar el cobro por Nequi. Verifica el número e intenta de nuevo." }, { status: 500 });
  }
}
