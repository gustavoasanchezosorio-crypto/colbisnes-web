import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcularPrecioOnline, calcularExtrasCheckout } from "@/lib/pricing";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import crypto from "crypto";
import { requireKyc } from "@/lib/requireKyc";
import { computeTrustScore } from "@/lib/trustScore";
import { bloqueoResponse } from "@/lib/accountBlock";
import { cancelarOrdenPendienteDeOtroMetodo } from "@/lib/checkoutSwitch";
import { requirePayoutInfo } from "@/lib/requirePayoutInfo";
import { requireEmailVerified } from "@/lib/requireEmailVerified";
import { requireAntiPhishing } from "@/lib/requireAntiPhishing";

export async function GET(req: NextRequest) {
  try {
    const { session, response: kycError } = await requireKyc();
    if (kycError) return NextResponse.redirect(new URL("/kyc?next=" + encodeURIComponent(req.url), req.url));

    const bloqueo = await bloqueoResponse(session.user.id);
    if (bloqueo) return bloqueo;

    // El correo debe estar confirmado antes de pagar.
    const faltaVerif = await requireEmailVerified(session.user.id);
    if (faltaVerif) return NextResponse.redirect(new URL("/auth/verify", req.url));

    // Debe tener su código anti-phishing configurado antes de pagar.
    const faltaAntiPhishing = await requireAntiPhishing(session.user.id);
    if (faltaAntiPhishing) return NextResponse.redirect(new URL("/perfil/editar", req.url));

    // El comprador debe tener Nequi + BreB configurados (para reembolsos y para vender después).
    const faltaPago = await requirePayoutInfo(session.user.id);
    if (faltaPago) return NextResponse.redirect(new URL("/perfil/editar?falta=pago", req.url));

    const productoId = req.nextUrl.searchParams.get("productoId");
    if (!productoId) return NextResponse.json({ error: "productoId requerido" }, { status: 400 });
    const proteccionExtendida = req.nextUrl.searchParams.get("proteccion") === "1";

    const producto = await prisma.product.findUnique({ where: { id: productoId } });
    if (!producto) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

    if (producto.status !== "AVAILABLE" && producto.status !== "PAYMENT_PENDING") {
      return NextResponse.json({ error: "El producto no está disponible para pago" }, { status: 400 });
    }

    // No puede comprar su propio producto
    if (producto.sellerId === session.user.id) {
      return NextResponse.json({ error: "No puedes comprar tu propio producto" }, { status: 403 });
    }

    const bloqueoVendedor = await bloqueoResponse(producto.sellerId);
    if (bloqueoVendedor) {
      return NextResponse.json({ error: "Este vendedor tiene su cuenta bloqueada temporalmente y no puede recibir ventas" }, { status: 403 });
    }

    let acceptedOfferId = producto.acceptedOfferId;
    let precioBase = producto.priceCOP;

    if (acceptedOfferId) {
      // Ya hay oferta aceptada — verificar que sea este comprador
      const offer = await prisma.offer.findUnique({ where: { id: acceptedOfferId } });
      if (!offer || offer.userId !== session.user.id) {
        return NextResponse.json(
          { error: "Solo el comprador con la oferta aceptada puede realizar este pago" },
          { status: 403 }
        );
      }
      // Precio base = monto de la oferta aceptada, no el precio publicado
      precioBase = offer.amountCOP;
    } else {
      // COMPRA DIRECTA al precio publicado: crear oferta al precio completo y aceptarla automáticamente
      const [nuevaOferta] = await prisma.$transaction([
        prisma.offer.create({
          data: {
            productId:  producto.id,
            userId:     session.user.id,
            amountCOP:  producto.priceCOP,
            status:     "ACCEPTED",
            message:    "Compra directa al precio publicado",
          },
        }),
        prisma.offer.updateMany({
          where: { productId: productoId, status: "PENDING" },
          data: { status: "REJECTED" },
        }),
        prisma.product.update({
          where: { id: productoId },
          data: {
            status: "PAYMENT_PENDING",
            paymentExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
          },
        }),
      ]);

      // Recuperar la oferta creada para obtener su id
      const ofertaCreada = await prisma.offer.findFirst({
        where: { productId: productoId, userId: session.user.id, status: "ACCEPTED" },
        orderBy: { createdAt: "desc" },
      });

      if (!ofertaCreada) throw new Error("Error creando la oferta de compra directa");

      await prisma.product.update({
        where: { id: productoId },
        data: { acceptedOfferId: ofertaCreada.id },
      });

      acceptedOfferId = ofertaCreada.id;
    }

    // El comprador cambió a pago online: cancela cualquier orden pendiente suya con otro método.
    await cancelarOrdenPendienteDeOtroMetodo(productoId, session.user.email, "ONLINE");

    // Idempotencia: si ya hay una orden PENDIENTE para este producto y este comprador, reutilizarla
    const ordenExistente = await prisma.order.findFirst({
      where: { productId: productoId, buyerEmail: session.user.email, estado: "PENDIENTE" },
    });

    const trust = await computeTrustScore(producto.sellerId);
    const pricing = calcularPrecioOnline(precioBase, trust.label);
    const extras = calcularExtrasCheckout(producto, proteccionExtendida);

    const orden = ordenExistente ?? await prisma.order.create({
      data: {
        productId:      producto.id,
        buyerEmail:     session.user.email,
        metodoPago:     "ONLINE",
        estado:         "PENDIENTE",
        totalPagado:    pricing.totalComprador + extras.extraTotal,
        comision:       pricing.comisionColbisnes,
        recibeVendedor: pricing.recibeVendedor,
        proteccionExtendida: extras.proteccionCosto > 0,
        proteccionCosto: extras.proteccionCosto,
        envioCobrado:   extras.envioCobrado,
        margenEnvio:    extras.margenEnvio,
      },
    });

    const referencia: string = "colbisnes" + orden.id.replace(/[^a-zA-Z0-9]/g, "") + Date.now();
    const montoEnCentavos: string = String(Math.round(orden.totalPagado * 100));
    const moneda: string = "COP";
    // .trim() defensivo: si el secreto se pegó en Railway con un salto de línea o espacio
    // invisible al final, la firma SHA256 sale mal y Wompi responde "La firma es inválida".
    const secretoIntegridad: string = (process.env.WOMPI_INTEGRITY_SECRET || "").trim();
    const publicKey: string = (process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY || "").trim();

    if (!secretoIntegridad) throw new Error("WOMPI_INTEGRITY_SECRET no está configurado");
    if (!publicKey) throw new Error("NEXT_PUBLIC_WOMPI_PUBLIC_KEY no está configurado");

    const cadenaConcatenada: string = referencia + montoEnCentavos + moneda + secretoIntegridad;
    const firma: string = crypto.createHash("sha256").update(cadenaConcatenada, "utf8").digest("hex");

    const baseUrl = process.env.NEXT_PUBLIC_URL || "https://colbisnes.com";
    const redirectUrl = baseUrl + "/checkout/confirmacion?orderId=" + orden.id;

    const wompiUrl =
      "https://checkout.wompi.co/p/" +
      "?public-key=" + encodeURIComponent(publicKey) +
      "&currency=" + encodeURIComponent(moneda) +
      "&amount-in-cents=" + encodeURIComponent(montoEnCentavos) +
      "&reference=" + encodeURIComponent(referencia) +
      "&signature:integrity=" + encodeURIComponent(firma) +
      "&redirect-url=" + encodeURIComponent(redirectUrl);

    return NextResponse.redirect(wompiUrl);
  } catch (err: any) {
    console.error("Error en checkout Wompi:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
