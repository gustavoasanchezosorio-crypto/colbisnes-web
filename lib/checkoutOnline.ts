import { prisma } from "@/lib/prisma";
import { calcularPrecioOnline, calcularExtrasCheckout, nivelParaDescuento } from "@/lib/pricing";
import { esCuentaMaster } from "@/lib/adminAuth";
import { requireSesion } from "@/lib/requireKyc";
import { computeTrustScore } from "@/lib/trustScore";
import { bloqueoResponse } from "@/lib/accountBlock";
import { cancelarOrdenPendienteDeOtroMetodo } from "@/lib/checkoutSwitch";
import { vendedorPuedeRecibirVentas, MENSAJE_VENDEDOR_NO_LISTO } from "@/lib/requirePayoutInfo";
import { requireEmailVerified } from "@/lib/requireEmailVerified";
import { direccionParaOrden, refrescarDireccionOrden } from "@/lib/direccionOrden";

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
  | "seller_payout"
  | "offer_forbidden"
  | "internal";

export async function prepararOrdenOnline(
  productoId: string,
  proteccionExtendida: boolean
): Promise<PrepararOnlineResult> {
  // Decisión 2026-10-26: el comprador ya NO necesita identidad verificada (reconocimiento
  // facial) para pagar — la garantía de la compra es el propio escrow/custodia del pago, no
  // el documento del comprador. El filtro de identidad queda solo para quien publica (ver
  // POST /api/products). Aquí solo se exige sesión iniciada. Se conserva el nombre de código
  // "kyc" (lo leen app/api/checkout/wompi/route.ts y .../nequi-online/route.ts, que
  // redirigen a /kyc) para no tocar esos switch — esa página ya redirige a /auth/login si
  // detecta que, en realidad, a quien llegó aquí le faltaba sesión y no verificación.
  const { session, response: authError } = await requireSesion();
  if (authError) return { ok: false, code: "kyc", status: 403 };

  const bloqueo = await bloqueoResponse(session.user.id);
  if (bloqueo) return { ok: false, code: "blocked", status: 403, message: "Tu cuenta está bloqueada temporalmente." };

  const faltaVerif = await requireEmailVerified(session.user.id);
  if (faltaVerif) return { ok: false, code: "emailVerification", status: 403 };

  // Decisión 2026-10-26 (2da ronda): se quitan también el código anti fraude y los datos de
  // cobro (Nequi/Bre-B) como requisito para que el COMPRADOR pague. Un comprador real se topó
  // con el bloqueo por no tener la llave Bre-B puesta y no pudo completar una compra que no
  // tenía nada que ver con ese dato — Bre-B/Nequi del comprador solo sirve como destino de un
  // reembolso eventual, no protege el pago en sí (eso lo hace el escrow). La única restricción
  // dura que le queda al comprador es tener el correo verificado (arriba) y, dentro del propio
  // checkout, una dirección de envío (se pide en la pantalla de pago, no aquí). El perfil
  // incompleto se sigue recordando con avisos — ver lib/profileCompletion.ts — pero ya no
  // bloquea. Los códigos "antiPhishing"/"payout" quedan en PrepararOnlineErrorCode y en los
  // switch de app/api/checkout/wompi y .../nequi-online por compatibilidad, aunque esta función
  // ya no los produce.
  if (!productoId) return { ok: false, code: "not_found", status: 400, message: "productoId requerido" };

  const producto = await prisma.product.findUnique({
    where: { id: productoId },
    include: { seller: { select: { role: true, email: true } } },
  });
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

  // El vendedor tiene que estar verificado Y tener a dónde cobrar ANTES de que entre plata
  // en custodia. Lo de "a dónde cobrar" se movió aquí desde POST /api/products (publicar):
  // allí no servía de nada, porque los campos se pueden vaciar después desde el perfil.
  // Lo de la identidad se sumó por el mismo motivo — publicar la comprueba una sola vez, y
  // una publicación vieja de alguien que ya no está verificado seguía cobrando igual.
  if (!(await vendedorPuedeRecibirVentas(producto.sellerId))) {
    return { ok: false, code: "seller_payout", status: 409, message: MENSAJE_VENDEDOR_NO_LISTO };
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

  // Volvió a intentar el pago sobre una orden que ya existía: puede haber corregido la
  // dirección en la pantalla de confirmación desde el intento anterior.
  if (ordenExistente) {
    const actualizada = await refrescarDireccionOrden(ordenExistente, session.user.id, producto.tipoEntrega);
    return { ok: true, orden: actualizada, session, precioBase };
  }

  const trust = await computeTrustScore(producto.sellerId);
  // El descuento por nivel se gana vendiendo, no verificándose (ver nivelParaDescuento
  // en lib/pricing.ts). Sin negocios cerrados el vendedor paga la comisión completa.
  //
  // Perfil MASTER (ver lib/adminAuth.ts): esta orden queda exenta de la comisión propia de
  // Colbisnes si el COMPRADOR o el VENDEDOR es la cuenta master — control total incluye no
  // pagarle a Colbisnes ni cuando master compra ni cuando master vende. Wompi/GMF se cobran
  // igual (son costos reales de un tercero, ver comentario en calcularPrecioOnline).
  const exentoComprador = esCuentaMaster(session);
  const exentoVendedor  = esCuentaMaster({ user: { role: producto.seller?.role, email: producto.seller?.email } });
  const exento = exentoComprador || exentoVendedor;
  const pricing = calcularPrecioOnline(precioBase, nivelParaDescuento(trust.label, trust.completedOrdersCount), exento);
  const extras = calcularExtrasCheckout(producto, proteccionExtendida, exentoComprador);
  const direccionEnvio = await direccionParaOrden(session.user.id, producto.tipoEntrega);

  const orden =
    await prisma.order.create({
      data: {
        productId: producto.id,
        buyerEmail: session.user.email,
        metodoPago: "ONLINE",
        estado: "PENDIENTE",
        totalPagado: pricing.totalComprador + extras.extraTotal,
        comision: pricing.comisionColbisnes,
        recibeVendedor: pricing.recibeVendedor,
        direccionEnvio,
        proteccionExtendida: extras.proteccionCosto > 0,
        proteccionCosto: extras.proteccionCosto,
        envioCobrado: extras.envioCobrado,
        margenEnvio: extras.margenEnvio,
      },
    });

  return { ok: true, orden, session, precioBase };
}
