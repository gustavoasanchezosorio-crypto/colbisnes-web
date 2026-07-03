import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcularPrecioUSDT, calcularExtrasCheckout } from "@/lib/pricing";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireKyc } from "@/lib/requireKyc";
import { computeTrustScore } from "@/lib/trustScore";
import { bloqueoResponse } from "@/lib/accountBlock";

export async function POST(req: NextRequest) {
  try {
    const { session, response: kycError } = await requireKyc();
    if (kycError) return kycError;

    const bloqueo = await bloqueoResponse(session.user.id);
    if (bloqueo) return bloqueo;

    const { productoId, proteccionExtendida } = await req.json();
    if (!productoId) return NextResponse.json({ error: "productoId requerido" }, { status: 400 });

    // Obtener tasa desde el servidor — no confiar en la tasa enviada por el cliente
    let tasaCOP = 4200; // fallback
    try {
      const tasaRes = await fetch(`${process.env.NEXT_PUBLIC_URL || "https://colbisnes-web.vercel.app"}/api/tasa-usdt`);
      const tasaData = await tasaRes.json();
      if (tasaData.tasa && !isNaN(tasaData.tasa)) tasaCOP = tasaData.tasa;
    } catch { /* usar fallback */ }

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

    // Idempotencia: si ya existe una orden activa para este producto (de cualquier método), devolverla
    const ordenExistente = await prisma.order.findFirst({
      where: {
        productId: productoId,
        estado: { notIn: ["RECHAZADO", "ANULADO", "ERROR"] },
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

    // Crear orden Y pasar producto a IN_ESCROW en una transacción atómica
    // NOTA: USDT se considera pagado cuando el comprador declara el envío.
    // El estado inicial es ESPERANDO_PAGO_CRYPTO hasta que se confirme manualmente.
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
      // Pasar producto a IN_ESCROW para que confirm-delivery funcione
      prisma.product.update({
        where: { id: productoId },
        data: { status: "IN_ESCROW", paidAt: new Date(), paymentExpiresAt: null },
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
