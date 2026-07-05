import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { rateLimit, getIP } from "@/lib/rateLimit";
import { requireKyc } from "@/lib/requireKyc";
import { sendEmail } from '@/lib/email';
import { sendWhatsapp } from '@/lib/whatsapp';
import { colbisnesEmailTemplate } from '@/lib/emailTemplate';
import { bloqueoResponse } from "@/lib/accountBlock";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");
    if (!productId) return NextResponse.json({ error: "productId is required" }, { status: 400 });

    const offers = await prisma.offer.findMany({
      where: { productId },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true } } },
    });
    return NextResponse.json(offers);
  } catch (error) {
    console.error("GET /api/offers error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { session, response: kycError } = await requireKyc();
    if (kycError) return kycError;

    const bloqueo = await bloqueoResponse(session.user.id);
    if (bloqueo) return bloqueo;

    const ip = getIP(request);
    const rl = rateLimit(`offers:${session.user.id}:${ip}`, { limit: 10, windowSeconds: 60 });
    if (!rl.allowed) {
      return NextResponse.json({ error: "Demasiadas ofertas. Intenta en 1 minuto." }, { status: 429 });
    }

    const body = await request.json();
    const { productId, amountCOP, message } = body;
    if (!productId || !amountCOP) {
      return NextResponse.json({ error: "productId y amountCOP requeridos" }, { status: 400 });
    }
    if (typeof amountCOP !== "number" || amountCOP < 1000) {
      return NextResponse.json({ error: "Oferta mínima: $1.000 COP" }, { status: 400 });
    }
    if (message && (typeof message !== "string" || message.length > 500)) {
      return NextResponse.json({ error: "Mensaje demasiado largo (máx 500 caracteres)" }, { status: 400 });
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { seller: true },
    });
    if (!product || product.status !== "AVAILABLE") {
      return NextResponse.json({ error: "Producto no disponible" }, { status: 400 });
    }
    if (product.sellerId === session.user.id) {
      return NextResponse.json({ error: "No puedes ofertar tu propio producto" }, { status: 400 });
    }

    if (Number(amountCOP) > Number(product.priceCOP)) {
      return NextResponse.json({ error: "La oferta no puede ser mayor al precio del producto" }, { status: 400 });
    }

    const offer = await prisma.offer.create({
      data: {
        productId,
        amountCOP: Number(amountCOP),
        message,
        status: "PENDING",
        userId: session.user.id,
      },
    });

    // Notificar al vendedor con HTML plano
    try {
      const html = colbisnesEmailTemplate({
        preheader: "Nueva oferta recibida",
        titulo: "Tienes una nueva oferta 🤝",
        cuerpo: `Hola ${product.seller.name || 'Vendedor'}, <strong>${session.user.name || 'un comprador'}</strong> ofreció <strong style="color:#1F6BFF;">$${Number(amountCOP).toLocaleString('es-CO')} COP</strong> por tu producto <strong>${product.title}</strong>.<br/><br/>Ingresa a Colbisnes para aceptar o rechazar la oferta.`,
        ctaTexto: "Ver oferta",
        ctaUrl: "https://colbisnes-web.vercel.app",
      });
      await sendEmail({
        to: product.seller.email,
        subject: 'Nueva oferta en Colbisnes',
        html,
      });
      await sendWhatsapp({
        to: (product.seller as any).phoneWhatsapp,
        body: "🤝 *Colbisnes* - Nueva oferta\n\nHola " + (product.seller.name || 'Vendedor') + ", tienes una oferta de $" + Number(amountCOP).toLocaleString('es-CO') + " COP por *" + product.title + "*.\n\nIngresa a Colbisnes para aceptarla o rechazarla.",
      });
    } catch (emailError) {
      console.error('Error enviando email de nueva oferta:', emailError);
    }

    return NextResponse.json(offer, { status: 201 });
  } catch (error) {
    console.error("POST /api/offers error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { session, response: kycError } = await requireKyc();
    if (kycError) return kycError;

    const body = await request.json();
    const { offerId, status } = body;
    if (!offerId || !status || !["ACCEPTED", "REJECTED"].includes(status)) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
      include: { product: { include: { seller: true } }, user: true },
    });

    if (!offer) {
      return NextResponse.json({ error: "Oferta no encontrada" }, { status: 404 });
    }
    if (offer.status !== "PENDING") {
      return NextResponse.json({ error: "La oferta ya no está pendiente" }, { status: 400 });
    }
    if (offer.product.sellerId !== session.user.id) {
      return NextResponse.json({ error: "No tienes permiso" }, { status: 403 });
    }

    if (status === "REJECTED") {
      await prisma.offer.update({ where: { id: offerId }, data: { status: "REJECTED" } });
      return NextResponse.json({ success: true, status: "REJECTED" });
    }

    if (offer.product.status !== "AVAILABLE") {
      return NextResponse.json({ error: "Producto no disponible" }, { status: 400 });
    }

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const result = await prisma.$transaction(async (tx) => {
      const updatedOffer = await tx.offer.update({
        where: { id: offerId },
        data: { status: "ACCEPTED" },
      });
      const updatedProduct = await tx.product.update({
        where: { id: offer.productId },
        data: {
          status: "PAYMENT_PENDING",
          acceptedOfferId: offerId,
          paymentExpiresAt: expiresAt,
        },
      });
      return { updatedOffer, updatedProduct };
    });

    // Notificar al comprador con HTML plano
    try {
      const html = colbisnesEmailTemplate({
        preheader: "Tu oferta fue aceptada",
        titulo: "¡Tu oferta fue aceptada! 🎉",
        cuerpo: `Hola ${offer.user.name || 'Comprador'}, el vendedor acepto tu oferta de <strong style="color:#1F6BFF;">$${Number(offer.amountCOP).toLocaleString('es-CO')} COP</strong> por <strong>${offer.product.title}</strong>.<br/><br/>Tienes <strong>10 minutos</strong> para realizar el pago, despues el producto quedara disponible de nuevo para otros compradores.`,
        ctaTexto: "Pagar ahora",
        ctaUrl: "https://colbisnes-web.vercel.app",
      });
      await sendEmail({
        to: offer.user.email,
        subject: '¡Tu oferta fue aceptada!',
        html,
      });
      await sendWhatsapp({
        to: (offer.user as any).phoneWhatsapp,
        body: `🎉 *Colbisnes* - ¡Oferta aceptada!\n\nHola ${offer.user.name || 'Comprador'}, tu oferta de $${Number(offer.amountCOP).toLocaleString('es-CO')} COP por *${offer.product.title}* fue aceptada.\n\nTienes 10 minutos para pagar antes de perder el producto.`,
      });
    } catch (emailError) {
      console.error('Error enviando email de oferta aceptada:', emailError);
    }

    try {
      const { io } = require("@/server.js");
      io.to(`product-${offer.productId}`).emit("product-status-changed", { productId: offer.productId, status: "PAYMENT_PENDING" });
    } catch(e) {}
    return NextResponse.json({ success: true, status: "ACCEPTED", product: result.updatedProduct });
  } catch (error) {
    console.error("PATCH /api/offers error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
