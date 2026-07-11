import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcularPrecioUSDT, calcularExtrasCheckout } from "@/lib/pricing";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireKyc } from "@/lib/requireKyc";
import { computeTrustScore } from "@/lib/trustScore";
import { bloqueoResponse } from "@/lib/accountBlock";
import { obtenerTasaUSDT } from "@/lib/tasaUsdt";
import { cancelarOrdenPendienteDeOtroMetodo } from "@/lib/checkoutSwitch";
import { requirePayoutInfo } from "@/lib/requirePayoutInfo";
import { requireEmailVerified } from "@/lib/requireEmailVerified";
import { requireAntiPhishing } from "@/lib/requireAntiPhishing";

export async function POST(req: NextRequest) {
  try {
    const { session, response: kycError } = await requireKyc();
    if (kycError) return kycError;

    const bloqueo = await bloqueoResponse(session.user.id);
    if (bloqueo) return bloqueo;

    const faltaVerif = await requireEmailVerified(session.user.id);
    if (faltaVerif) return faltaVerif;

    const faltaAntiPhishing = await requireAntiPhishing(session.user.id);
    if (faltaAntiPhishing) return faltaAntiPhishing;

    const faltaPago = await requirePayoutInfo(session.user.id);
    if (faltaPago) return faltaPago;

    const { productoId, proteccionExtendida } = await req.json();
    if (!productoId) return NextResponse.json({ error: "productoId requerido" }, { status: 400 });

    // Obtener tasa desde el servidor — no confiar en la tasa enviada por el cliente.
    // Antes esto se auto-llamaba por HTTP a NEXT_PUBLIC_URL + "/api/tasa-usdt", una ruta
    // frágil que dependía de esa variable de entorno apuntando al dominio correcto; cuando
    // apuntaba (o caía al fallback) a un dominio muerto, fallaba en silencio y la orden se
    // creaba con la tasa fija 4200 mientras el checkout mostraba la tasa real — descuadre
    // confirmado en producción el 2026-07-06. Ahora se llama la función compartida
    // directamente en el mismo proceso, sin HTTP de por medio.
    const { tasa: tasaCOP, fuente: fuenteTasa } = await obtenerTasaUSDT();
    if (fuenteTasa === "fallback") {
      console.error("POST /api/checkout/usdt: creando orden con tasa de respaldo (4200), no se pudo obtener tasa en vivo. productoId:", productoId);
    }

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

    // El comprador cambió a USDT: cancela cualquier orden pendiente suya con otro método.
    await cancelarOrdenPendienteDeOtroMetodo(productoId, session.user.email, "USDT_BEP20");

    // Idempotencia: si ya existe una orden ACTIVA para este producto (de cualquier método), devolverla.
    // CRÍTICO: hay que excluir también CANCELADO — una orden cancelada (p.ej. por vencerse el plazo
    // de pago vía liberarProductosExpirados) NO es una orden en curso. Antes no se excluía, así que al
    // ir a pagar una oferta NUEVA, este findFirst devolvía la orden vieja CANCELADA y mandaba al
    // comprador a una pantalla "orden ya no activa" — el pago quedaba "pegado" a una orden muerta
    // (incidente 2026-07-07: producto con oferta nueva aceptada seguía apuntando a la orden cancelada).
    const ordenExistente = await prisma.order.findFirst({
      where: {
        productId: productoId,
        estado: { notIn: ["RECHAZADO", "ANULADO", "ERROR", "CANCELADO"] },
      },
    });
    if (ordenExistente) {
      if (ordenExistente.buyerEmail === session.user.email) {
        const trustExistente = await computeTrustScore(producto.sellerId);
        const precioBaseExistente = ordenExistente.recibeVendedor;
        const pricing2 = calcularPrecioUSDT(precioBaseExistente, tasaCOP, trustExistente.label);
        return NextResponse.json({
          ok: true,
          ordenId: ordenExistente.id,
          totalUSDT: ordenExistente.totalUSDT ?? pricing2.totalUSD,
          wallet: pricing2.wallet,
          red: pricing2.red,
        });
      }
      return NextResponse.json({ error: "Este producto ya tiene un pago en curso" }, { status: 409 });
    }

    // Si no hay oferta aceptada: compra directa al precio publicado (igual que en online/contra-entrega)
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
      // Solo el comprador con la oferta aceptada puede pagar
      const offer = await prisma.offer.findUnique({ where: { id: producto.acceptedOfferId } });
      if (!offer || offer.userId !== session.user.id) {
        return NextResponse.json(
          { error: "Solo el comprador con la oferta aceptada puede realizar este pago" },
          { status: 403 }
        );
      }
      // Precio base = monto de la oferta aceptada (no el precio publicado del producto,
      // que puede ser distinto si el vendedor aceptó una contraoferta del comprador)
      precioBase = offer.amountCOP;
    }

    const trust = await computeTrustScore(producto.sellerId);

    const pricing = calcularPrecioUSDT(precioBase, tasaCOP, trust.label);
    const extras = calcularExtrasCheckout(producto, !!proteccionExtendida);
    const extrasUSD = parseFloat((extras.extraTotal / tasaCOP).toFixed(2));
    const totalUSDFinal = parseFloat((pricing.totalUSD + extrasUSD).toFixed(2));

    // Crear orden Y pasar producto a PAYMENT_PENDING (NO a IN_ESCROW) en una transacción atómica.
    // El producto solo debe pasar a IN_ESCROW cuando /api/usdt/verificar confirme el pago real
    // en blockchain. Si se marcara IN_ESCROW aquí, el producto se vería "vendido/en custodia"
    // aunque el comprador nunca haya transferido nada — y quedaría bloqueado para siempre si
    // abandona el pago (no existía forma de liberarlo de vuelta a AVAILABLE).
    // Damos 10 minutos (mismo plazo que se comunica al comprador al aceptarse su oferta,
    // en app/api/offers/route.ts, e igual al que se muestra en la pantalla de pago) — antes
    // esto daba 30 minutos aquí, pisando el plazo de 10 que ya se le había prometido al
    // comprador por email/WhatsApp desde el momento de la aceptación (descuadre reportado
    // por el usuario 2026-07-07). El chequeo en tiempo real vía liberarProductosExpirados()
    // (llamado desde GET /api/products y /api/products/[id]) libera el producto en cuanto
    // alguien carga esas rutas después de vencido el plazo; el cron diario es solo respaldo.
    const expiraEn = new Date(Date.now() + 10 * 60 * 1000);
    const [orden] = await prisma.$transaction([
      prisma.order.create({
        data: {
          productId:      producto.id,
          buyerEmail:     session.user.email,
          metodoPago:     "USDT_BEP20",
          estado:         "ESPERANDO_PAGO_CRYPTO",
          totalPagado:    Math.round(totalUSDFinal * tasaCOP),
          comision:       Math.round(pricing.comisionUSD * tasaCOP),
          recibeVendedor: precioBase,
          totalUSDT:      totalUSDFinal,
          proteccionExtendida: extras.proteccionCosto > 0,
          proteccionCosto: extras.proteccionCosto,
          envioCobrado:   extras.envioCobrado,
          margenEnvio:    extras.margenEnvio,
        },
      }),
      prisma.product.update({
        where: { id: productoId },
        data: { status: "PAYMENT_PENDING", paymentExpiresAt: expiraEn },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      ordenId: orden.id,
      totalUSDT: totalUSDFinal,
      wallet: pricing.wallet,
      red: pricing.red,
    });
  } catch (err: any) {
    console.error("POST /api/checkout/usdt error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
