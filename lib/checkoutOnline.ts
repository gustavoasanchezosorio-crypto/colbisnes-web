import { prisma } from "@/lib/prisma";
import { calcularPrecioOnline, calcularExtrasCheckout } from "@/lib/pricing";
import { requireKyc } from "@/lib/requireKyc";
import { computeTrustScore } from "@/lib/trustScore";
import { bloqueoResponse } from "@/lib/accountBlock";
import { cancelarOrdenPendienteDeOtroMetodo } from "@/lib/checkoutSwitch";
import { requirePayoutInfo } from "@/lib/requirePayoutInfo";
import { requireEmailVerified } from "@/lib/requireEmailVerified";
import { requireAntiPhishing } from "@/lib/requireAntiPhishing";

// Resultado de preparar una orden de pago ONLINE. Se comparte entre el checkout web de Wompi
// (redirect) y el cobro Nequi push (API JSON), para que la lógica de dinero —ofertas, precios,
// comisiones, reserva del producto— viva en un solo lugar y no pueda divergir entre ambos.
export type PrepararOnlineResult =
  | { ok: true; orden: any; session: any; precioBase: number }
  | { ok: false; code: PrepararOnlineErrorCode; status: number; message?: string };

export type PrepararOnlineErrorCode =
  | "kyc"
  | "blocked"
  | "emailVerification"
  | "antiPhishing"
  | "payout"
  | "not_found"
  | "not_available"
  | "own_product"
  | "seller_blocked"
  | "offer_forbidden"
  | "internal";

export async function prepararOrdenOnline(
  productoId: string,
  proteccionExtendida: boolean
): Promise<PrepararOnlineResult> {
  const { session, response: kycError } = await requireKyc();
  if (kycError) return { ok: false, code: "kyc", status: 403 };

  const bloqueo = await bloqueoResponse(session.user.id);
  if (bloqueo) return { ok: false, code: "blocked", status: 403, message: "Tu cuenta está bloqueada temporalmente." };

  const faltaVerif = await requireEmailVerified(session.user.id);
  if (faltaVerif) return { ok: false, code: "emailVerification", status: 403 };

  const faltaAntiPhishing = await requireAntiPhishing(session.user.id);
  if (faltaAntiPhishing) return { ok: false, code: "antiPhishing", status: 403 };

  const faltaPago = await requirePayoutInfo(session.user.id);
  if (faltaPago) return { ok: false, code: "payout", status: 403 };

  if (!productoId) return { ok: false, code: "not_found", status: 400, message: "productoId requerido" };

  const producto = await prisma.product.findUnique({ where: { id: productoId } });
  if (!producto) return { ok: false, code: "not_found", status: 404, message: "Producto no encontrado" };

  if (producto.status !== "AVAILABLE" && producto.status !== "PAYMENT_PENDING") {
    return { ok: false, code: "not_available", status: 400, message: "El producto no está disponible para pago" };
  }

  if (producto.sellerId === session.user.id) {
    return { ok: false, code: "own_product", status: 403, message: "No puedes comprar tu propio producto" };
  }

  const bloqueoVendedor = await bloqueoResponse(producto.sellerId);
  if (bloqueoVendedor) {
    return { ok: false, code: "seller_blocked", status: 403, message: "Este vendedor tiene su cuenta bloqueada temporalmente y no puede recibir ventas" };
  }

  let acceptedOfferId = producto.acceptedOfferId;
  let precioBase = producto.priceCOP;

  if (acceptedOfferId) {
    const offer = await prisma.offer.findUnique({ where: { id: acceptedOfferId } });
    if (!offer || offer.userId !== session.user.id) {
      return { ok: false, code: "offer_forbidden", status: 403, message: "Solo el comprador con la oferta aceptada puede realizar este pago" };
    }
    precioBase = offer.amountCOP;
  } else {
    // COMPRA DIRECTA al precio publicado: crear oferta al precio completo y aceptarla automáticamente.
    await prisma.$transaction([
      prisma.offer.create({
        data: {
          productId: producto.id,
          userId: session.user.id,
          amountCOP: producto.priceCOP,
          status: "ACCEPTED",
          message: "Compra directa al precio publicado",
        },
      }),
      prisma.offer.updateMany({
        where: { productId: productoId, status: "PENDING" },
        data: { status: "REJECTED" },
      }),
      prisma.product.update({
        where: { id: productoId },
        data: { status: "PAYMENT_PENDING", paymentExpiresAt: new Date(Date.now() + 10 * 60 * 1000) },
      }),
    ]);

    const ofertaCreada = await prisma.offer.findFirst({
      where: { productId: productoId, userId: session.user.id, status: "ACCEPTED" },
      orderBy: { createdAt: "desc" },
    });
    if (!ofertaCreada) return { ok: false, code: "internal", status: 500, message: "Error creando la oferta de compra directa" };

    await prisma.product.update({
      where: { id: productoId },
      data: { acceptedOfferId: ofertaCreada.id },
    });
    acceptedOfferId = ofertaCreada.id;
  }

  // El comprador cambió a pago online: cancela cualquier orden pendiente suya con otro método.
  await cancelarOrdenPendienteDeOtroMetodo(productoId, session.user.email, "ONLINE");

  const ordenExistente = await prisma.order.findFirst({
    where: { productId: productoId, buyerEmail: session.user.email, estado: "PENDIENTE" },
  });

  const trust = await computeTrustScore(producto.sellerId);
  const pricing = calcularPrecioOnline(precioBase, trust.label);
  const extras = calcularExtrasCheckout(producto, proteccionExtendida);

  const orden =
    ordenExistente ??
    (await prisma.order.create({
      data: {
        productId: producto.id,
        buyerEmail: session.user.email,
        metodoPago: "ONLINE",
        estado: "PENDIENTE",
        totalPagado: pricing.totalComprador + extras.extraTotal,
        comision: pricing.comisionColbisnes,
        recibeVendedor: pricing.recibeVendedor,
        proteccionExtendida: extras.proteccionCosto > 0,
        proteccionCosto: extras.proteccionCosto,
        envioCobrado: extras.envioCobrado,
        margenEnvio: extras.margenEnvio,
      },
    }));

  return { ok: true, orden, session, precioBase };
}
