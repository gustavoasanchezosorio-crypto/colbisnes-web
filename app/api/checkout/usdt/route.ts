import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcularPrecioUSDT, calcularExtrasCheckout } from "@/lib/pricing";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireSesion } from "@/lib/requireKyc";
import { computeTrustScore } from "@/lib/trustScore";
import { esCuentaMaster } from "@/lib/adminAuth";
import { bloqueoResponse } from "@/lib/accountBlock";
import { obtenerTasaUSDT } from "@/lib/tasaUsdt";
import { cancelarOrdenPendienteDeOtroMetodo } from "@/lib/checkoutSwitch";
import { vendedorPuedeRecibirVentas, MENSAJE_VENDEDOR_NO_LISTO } from "@/lib/requirePayoutInfo";
import { requireEmailVerified } from "@/lib/requireEmailVerified";
import { enModoPrueba, bloqueadoPorModoPrueba, MENSAJE_PAGO_BLOQUEADO } from "@/lib/modoPrueba";
import { direccionParaOrden, refrescarDireccionOrden } from "@/lib/direccionOrden";

export async function POST(req: NextRequest) {
  try {
    // MODO PRUEBA (prelanzamiento): el pago en USDT le pide al comprador una
    // transferencia real en BEP20 a la billetera de Colbisnes. Irreversible.
    if (enModoPrueba(req)) return bloqueadoPorModoPrueba(MENSAJE_PAGO_BLOQUEADO);

    // Decisión 2026-10-26: el comprador ya NO necesita identidad verificada (reconocimiento
    // facial) para pagar — la garantía de la compra es el propio escrow/custodia del pago,
    // no el documento del comprador. El filtro de identidad queda solo para quien publica
    // (ver POST /api/products y el comentario de requireKyc() en lib/requireKyc.ts). Aquí
    // solo se exige sesión iniciada.
    const { session, response: authError } = await requireSesion();
    if (authError) return authError;

    const bloqueo = await bloqueoResponse(session.user.id);
    if (bloqueo) return bloqueo;

    const faltaVerif = await requireEmailVerified(session.user.id);
    if (faltaVerif) return faltaVerif;

    // Decisión 2026-10-26 (2da ronda): se quitan el código anti fraude y los datos de cobro
    // (Nequi/Bre-B) como requisito para que el COMPRADOR pague — ver el comentario largo en
    // lib/checkoutOnline.ts. La única restricción dura que le queda es el correo verificado
    // (arriba) y la dirección de envío, que se pide más abajo en este mismo flujo.

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

    const producto = await prisma.product.findUnique({
      where: { id: productoId },
      include: { seller: { select: { role: true, email: true } } },
    });
    if (!producto) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

    if (producto.sellerId === session.user.id) {
      return NextResponse.json({ error: "No puedes comprar tu propio producto" }, { status: 403 });
    }

    const bloqueoVendedor = await bloqueoResponse(producto.sellerId);
    if (bloqueoVendedor) {
      return NextResponse.json({ error: "Este vendedor tiene su cuenta bloqueada temporalmente y no puede recibir ventas" }, { status: 403 });
    }

    // El vendedor tiene que estar verificado y tener a dónde cobrar antes de que arranque
    // la venta (ver el comentario largo en lib/requirePayoutInfo.ts).
    if (!(await vendedorPuedeRecibirVentas(producto.sellerId))) {
      return NextResponse.json({ error: MENSAJE_VENDEDOR_NO_LISTO }, { status: 409 });
    }

    if (producto.status !== "AVAILABLE" && producto.status !== "PAYMENT_PENDING") {
      return NextResponse.json({ error: "El producto no está disponible para pago" }, { status: 400 });
    }

    // Fase 1 de "varias unidades" (ver prisma/schema.prisma, campo Product.stockQuantity):
    // USDT todavía no sabe vender/reservar por cantidad — solo el pago online
    // (lib/checkoutOnline.ts) lo soporta. Se bloquea con un mensaje claro en vez de vender
    // de a 1 silenciosamente cuando el vendedor en realidad publicó varias unidades.
    if (producto.stockQuantity > 1) {
      return NextResponse.json(
        { error: "Este producto tiene varias unidades disponibles. Por ahora, para comprar varias unidades debes usar pago en línea (tarjeta, PSE o Nequi)." },
        { status: 400 }
      );
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
        // Puede haber corregido su dirección desde el intento anterior: se pone al día
        // mientras el paquete no haya salido (ver lib/direccionOrden.ts).
        await refrescarDireccionOrden(ordenExistente, session.user.id, producto.tipoEntrega);
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

    // Perfil MASTER (ver lib/adminAuth.ts): exento de la comisión de Colbisnes si el
    // COMPRADOR o el VENDEDOR es la cuenta master. A diferencia de contra-entrega, en USDT
    // no hay un cobro aparte que saltarse ni un piso tipo WOMPI_MIN_TX_COP — comisionUSD ya
    // va sumado dentro de totalUSDT, así que exento=true simplemente baja ese total; el
    // resto del flujo (confirmación por /api/usdt/verificar contra la blockchain) no cambia.
    const exentoComprador = esCuentaMaster(session);
    const exentoVendedor  = esCuentaMaster({ user: { role: producto.seller?.role, email: producto.seller?.email } });
    const exento = exentoComprador || exentoVendedor;
    const pricing = calcularPrecioUSDT(precioBase, tasaCOP, trust.label, exento);
    const datosEnvioPreview = await direccionParaOrden(session.user.id, producto.tipoEntrega);
    const extras = calcularExtrasCheckout(producto, !!proteccionExtendida, exentoComprador, datosEnvioPreview.ciudadDestino);
    // Red de seguridad: no se pudo calcular un costo de envío fiable (falta la ciudad
    // de destino del comprador, o el vendedor nunca declaró un peso aproximado). Se
    // bloquea el pago en vez de crear la orden con envioCobrado=0 sin que nadie lo
    // haya decidido — ver el comentario largo en calcularExtrasCheckout.
    if (extras.envioPendiente) {
      return NextResponse.json(
        { error: "No pudimos calcular el costo del envío para este producto. Agrega tu ciudad de destino en tu perfil, o contacta al vendedor por el chat, antes de pagar." },
        { status: 409 }
      );
    }
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
    const datosEnvio = await direccionParaOrden(session.user.id, producto.tipoEntrega);
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
          direccionEnvio: datosEnvio.direccionEnvio,
          ciudadDestino: datosEnvio.ciudadDestino,
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
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
