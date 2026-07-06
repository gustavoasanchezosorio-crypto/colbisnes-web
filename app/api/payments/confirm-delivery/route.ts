import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireKyc } from "@/lib/requireKyc";
import { sendEmail } from '@/lib/email';
import { sendWhatsapp } from '@/lib/whatsapp';
import { colbisnesEmailTemplate } from '@/lib/emailTemplate';

export async function POST(request: Request) {
  try {
    const { session, response: kycError } = await requireKyc();
    if (kycError) return kycError;

    const { productId } = await request.json();
    if (!productId) {
      return NextResponse.json({ error: "productId requerido" }, { status: 400 });
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        seller: true,
        offers: { where: { status: "ACCEPTED" }, include: { user: true } },
      },
    });

    if (!product) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }
    if (product.status !== "IN_ESCROW") {
      return NextResponse.json({ error: "El producto no está en custodia" }, { status: 400 });
    }

    // Defensa en profundidad (post-auditoría 2026-07-06): IN_ESCROW ahora solo debería
    // establecerse una vez confirmado un pago real (ver contra-entrega/route.ts y
    // confirmar-comision-nequi/route.ts para el caso que causó el bug original). Aun así,
    // verificamos que no exista una orden de este producto todavía esperando el pago —si
    // existiera, algo quedó inconsistente y es más seguro bloquear y dejar que soporte
    // revise, que permitir marcar el producto SOLD sin plata confirmada.
    const ordenPendientePago = await prisma.order.findFirst({
      where: { productId, estado: { in: ["ESPERANDO_COMISION", "ESPERANDO_PAGO_CRYPTO"] } },
    });
    if (ordenPendientePago) {
      return NextResponse.json(
        { error: "Hay una orden de este producto todavía esperando confirmación de pago. Contacta a soporte." },
        { status: 409 }
      );
    }

    // Verificar que es el comprador: ya sea por oferta aceptada O por buyerEmail en la orden
    const acceptedOffer = product.offers[0];
    const esBuyerPorOferta = acceptedOffer?.userId === session.user.id;

    const orden = await prisma.order.findFirst({
      where: {
        productId,
        estado: { in: ["PAGADO", "ESPERANDO_ENVIO", "EN_CAMINO", "ENTREGADO"] },
      },
      orderBy: { createdAt: "desc" },
    });

    const esBuyerPorOrden = orden?.buyerEmail?.toLowerCase() === session.user.email.toLowerCase();

    if (!esBuyerPorOferta && !esBuyerPorOrden) {
      return NextResponse.json({ error: "Solo el comprador puede confirmar que recibió el producto" }, { status: 403 });
    }

    // Marcar como vendido
    const updated = await prisma.product.update({
      where: { id: productId },
      data: { status: "SOLD", soldAt: new Date() },
    });

    await prisma.offer.updateMany({
      where: { productId, status: "PENDING" },
      data: { status: "REJECTED" },
    });

    // Actualizar la Order a COMPLETADO
    if (orden) {
      await prisma.order.update({
        where: { id: orden.id },
        data: { estado: "COMPLETADO" },
      });
    }

    if (product.seller) {
      try {
        const montoVendedor = orden?.recibeVendedor != null ? Number(orden.recibeVendedor) : Number(product.priceCOP);
        const html = colbisnesEmailTemplate({
          preheader: "Tu pago está en proceso de liberación",
          titulo: "¡Entrega confirmada! ⭐",
          cuerpo: `Hola ${product.seller.name || 'Vendedor'}, el comprador confirmó que recibió <strong>${product.title}</strong> en buen estado.<br/><br/>Tu pago de <strong style="color:#1F6BFF;">$${montoVendedor.toLocaleString('es-CO')} COP</strong> está en proceso de liberación y lo recibirás pronto. ¡Gracias por vender en Colbisnes!`,
          ctaTexto: "Ver mis ventas",
          ctaUrl: "https://colbisnes-web.vercel.app",
        });
        await sendEmail({ to: product.seller.email, subject: 'Entrega confirmada - Colbisnes', html });
        await sendWhatsapp({
          to: (product.seller as any).phoneWhatsapp,
          body: `⭐ *Colbisnes* - Entrega confirmada!\n\nHola ${product.seller.name || 'Vendedor'}, el comprador confirmó la entrega de *${product.title}*.\n\nTu pago de $${montoVendedor.toLocaleString('es-CO')} COP está en proceso de liberación.`,
        });
        await sendWhatsapp({
          to: process.env.ADMIN_WHATSAPP || '',
          body: `🔔 *ADMIN* - Pago pendiente de liberar\n\nProducto: ${product.title}\nVendedor: ${product.seller.name || 'Sin nombre'}\nMonto: $${montoVendedor.toLocaleString('es-CO')} COP\n\nIngresa al panel admin para liberar el pago.`,
        });
      } catch (emailError) {
        console.error('Error enviando notificación de entrega:', emailError);
      }
    }

    return NextResponse.json({ success: true, product: updated });
  } catch (error) {
    console.error("POST /api/payments/confirm-delivery error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
