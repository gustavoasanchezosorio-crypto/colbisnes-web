import { NextResponse } from "next/server";

// Endpoint de prueba DESHABILITADO en producción
if (process.env.NODE_ENV === "production") {
  // Exportar directamente para que Next.js lo rechace en build time no es posible,
  // lo manejamos en runtime abajo.
}

import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { sendWhatsapp } from "@/lib/whatsapp";
import { colbisnesEmailTemplate } from "@/lib/emailTemplate";

export async function POST(request: Request) {
  // Solo disponible en desarrollo
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "No disponible en producción" }, { status: 403 });
  }

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { productId } = await request.json();
    if (!productId) {
      return NextResponse.json({ error: "productId es requerido" }, { status: 400 });
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { seller: true },
    });

    if (!product) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }
    if (product.status !== "PAYMENT_PENDING") {
      return NextResponse.json({ error: "El producto no está pendiente de pago" }, { status: 400 });
    }

    const updated = await prisma.product.update({
      where: { id: productId },
      data: {
        status: "IN_ESCROW",
        paidAt: new Date(),
        paymentExpiresAt: null,
      },
    });

    try {
      const html = colbisnesEmailTemplate({
        preheader: "Pago recibido en custodia",
        titulo: "Recibiste un pago 💳",
        cuerpo: `Hola ${product.seller.name || "Vendedor"}, el comprador ya realizó el pago de <strong style="color:#1F6BFF;">$${Number(product.priceCOP).toLocaleString("es-CO")} COP</strong> por <strong>${product.title}</strong>.<br/><br/>El dinero está en custodia segura de Colbisnes. Empaca tu producto y registra el envío para que el comprador pueda hacer seguimiento.`,
        ctaTexto: "Registrar envío",
        ctaUrl: "https://colbisnes.com",
      });
      await sendEmail({
        to: product.seller.email,
        subject: "Pago recibido por tu producto",
        html,
      });
      await sendWhatsapp({
        to: (product.seller as any).phoneWhatsapp,
        body:
          "💳 *Colbisnes* - Pago recibido\n\nHola " +
          (product.seller.name || "Vendedor") +
          ", recibiste un pago de $" +
          Number(product.priceCOP).toLocaleString("es-CO") +
          " COP por *" +
          product.title +
          "*.\n\nEl dinero está en custodia. Registra el envío en Colbisnes.",
      });
    } catch (emailError) {
      console.error("Error enviando email de pago recibido:", emailError);
    }

    return NextResponse.json({ success: true, product: updated });
  } catch (error) {
    console.error("POST /api/payments/mock error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
