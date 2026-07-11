import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcularPrecioContraEntrega, calcularExtrasCheckout } from "@/lib/pricing";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireKyc } from "@/lib/requireKyc";
import { computeTrustScore } from "@/lib/trustScore";
import { bloqueoResponse } from "@/lib/accountBlock";
import { calcularFechaLimiteEnvio } from "@/lib/businessHours";
import { cancelarOrdenPendienteDeOtroMetodo } from "@/lib/checkoutSwitch";
import { requirePayoutInfo } from "@/lib/requirePayoutInfo";
import { requireEmailVerified } from "@/lib/requireEmailVerified";

export async function POST(req: NextRequest) {
  try {
    const { session, response: kycError } = await requireKyc();
    if (kycError) return kycError;

    const bloqueo = await bloqueoResponse(session.user.id);
    if (bloqueo) return bloqueo;

    const faltaVerif = await requireEmailVerified(session.user.id);
    if (faltaVerif) return faltaVerif;

    const faltaPago = await requirePayoutInfo(session.user.id);
    if (faltaPago) return faltaPago;

    const { productoId, proteccionExtendida } = await req.json();
    if (!productoId) return NextResponse.json({ error: "productoId requerido" }, { status: 400 });

    const producto = await prisma.product.findUnique({ where: { id: productoId } });
    if (!producto) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

    if (producto.sellerId === session.user.id) {
      return NextResponse.json({ error: "No puedes comprar tu propio producto" }, { status: 403 });
    }

    const bloqueoVendedor = await bloqueoResponse(producto.sellerId);
    if (bloqueoVendedor) {
      return NextResponse.json({ error: "Este vendedor tiene su cuenta bloqueada temporalmente y no puede recibir ventas" }, { status: 403 });
    }

    if (producto.status !== "AVAILABLE" && producto.status !== "PAYMENT_PENDING") {
      return NextResponse.json({ error: "El producto no está disponible para pago" }, { status: 400 });
    }

    // El comprador cambió a contra entrega: cancela cualquier orden pendiente suya con otro método.
    await cancelarOrdenPendienteDeOtroMetodo(productoId, session.user.email, "CONTRA_ENTREGA");

    // Idempotencia: si ya existe una orden activa para este producto, devolverla o bloquear.
    // Se excluye CANCELADO (además de RECHAZADO/ANULADO/ERROR): una orden cancelada por vencerse
    // el plazo de pago no es una orden en curso y no debe bloquear ni reusarse para una oferta nueva.
    const ordenExistente = await prisma.order.findFirst({
      where: { productId: productoId, estado: { notIn: ["RECHAZADO", "ANULADO", "ERROR", "CANCELADO"] } },
    });
    if (ordenExistente) {
      if (ordenExistente.buyerEmail === session.user.email) {
        return NextResponse.json({ ok: true, ordenId: ordenExistente.id });
      }
      return NextResponse.json({ error: "Este producto ya tiene un pago en curso" }, { status: 409 });
    }

    // Si no hay oferta aceptada: compra directa al precio publicado
    let precioBase = producto.priceCOP;
    if (!producto.acceptedOfferId) {
      const nuevaOferta = await prisma.offer.create({
        data: {
          productId:  producto.id,
          userId:     session.user.id,
          amountCOP:  producto.priceCOP,
          status:     "ACCEPTED",
          message:    "Compra directa al precio publicado",
        },
      });
      await prisma.offer.updateMany({
        where: { productId: productoId, status: "PENDING", id: { not: nuevaOferta.id } },
        data: { status: "REJECTED" },
      });
      await prisma.product.update({
        where: { id: productoId },
        data: { acceptedOfferId: nuevaOferta.id, status: "PAYMENT_PENDING" },
      });
    } else {
      // Verificar que sea el comprador con la oferta aceptada
      const offer = await prisma.offer.findUnique({ where: { id: producto.acceptedOfferId } });
      if (!offer || offer.userId !== session.user.id) {
        return NextResponse.json({ error: "Solo el comprador con la oferta aceptada puede realizar este pago" }, { status: 403 });
      }
      // Precio base = monto de la oferta aceptada, no el precio publicado
      precioBase = offer.amountCOP;
    }

    const trust = await computeTrustScore(producto.sellerId);
    const pricing = calcularPrecioContraEntrega(precioBase, trust.label);
    const extras = calcularExtrasCheckout(producto, !!proteccionExtendida);
    const codigoSecreto = Math.floor(100000 + Math.random() * 900000).toString();
    const ahora = new Date();

    // El comprador debe pagar primero, por Nequi, la comisión de Colbisnes (garantía de reserva).
    // La orden queda en ESPERANDO_COMISION hasta que un admin confirme el comprobante Nequi.
    // El plazo de 24 horas hábiles (8am-8pm) para que el vendedor despache corre desde este momento
    // (creación/aceptación de la compra), sin importar cuándo se confirme la comisión.
    //
    // El producto pasa a PAYMENT_PENDING (NO a IN_ESCROW) aquí — mismo patrón que
    // /api/checkout/usdt. Todavía no hay dinero real confirmado en este punto (el comprador
    // apenas está a punto de transferir la comisión por Nequi); marcarlo IN_ESCROW ya
    // permitía a cualquier comprador llamar /api/payments/confirm-delivery de inmediato y
    // dejar el producto SOLD para siempre sin pagar nada (bug encontrado en auditoría 2026-07-06).
    // Solo /api/admin/confirmar-comision-nequi debe pasar el producto a IN_ESCROW, una vez el
    // admin confirma manualmente que la comisión sí se transfirió.
    const PLAZO_COMISION_MS = 24 * 60 * 60 * 1000; // 24h para subir comprobante y que el admin lo confirme
    const [orden] = await prisma.$transaction([
      prisma.order.create({
        data: {
          productId:      producto.id,
          buyerEmail:     session.user.email,
          metodoPago:     "CONTRA_ENTREGA",
          estado:         "ESPERANDO_COMISION",
          totalPagado:    pricing.totalComprador + extras.extraTotal,
          comision:       pricing.comisionColbisnes,
          recibeVendedor: pricing.recibeVendedor,
          codigoSecreto,
          proteccionExtendida: extras.proteccionCosto > 0,
          proteccionCosto: extras.proteccionCosto,
          envioCobrado:   extras.envioCobrado,
          margenEnvio:    extras.margenEnvio,
          comisionReservaCOP: pricing.comisionColbisnes,
          fechaLimiteEnvio: calcularFechaLimiteEnvio(ahora),
        },
      }),
      prisma.product.update({
        where: { id: productoId },
        data: { status: "PAYMENT_PENDING", paymentExpiresAt: new Date(Date.now() + PLAZO_COMISION_MS) },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      ordenId: orden.id,
      comisionReservaCOP: pricing.comisionColbisnes,
      nequiNumero: process.env.COLBISNES_NEQUI_NUMERO || null,
    });
  } catch (err: any) {
    console.error("POST /api/checkout/contra-entrega error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
