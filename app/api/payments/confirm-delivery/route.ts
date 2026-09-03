import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireSesion } from "@/lib/requireKyc";
import { sendEmail } from '@/lib/email';
import { sendWhatsapp } from '@/lib/whatsapp';
import { colbisnesEmailTemplate } from '@/lib/emailTemplate';
import { generarComprobantePDF } from '@/lib/comprobante';
import { registrarAuditoria } from '@/lib/audit';
import { enModoPrueba, bloqueadoPorModoPrueba } from '@/lib/modoPrueba';

export async function POST(request: Request) {
  try {
    // MODO PRUEBA (prelanzamiento): confirmar la entrega es el gatillo que libera
    // la custodia — marca el producto SOLD, cierra la orden y habilita el pago al
    // vendedor. Un probador NO puede dispararlo, aunque su navegador tenga el link
    // secreto. Se corta aquí, antes que nada, para que el mensaje que reciba sea
    // este y no un error de KYC que no le dice nada.
    //
    // Se eligió bloquear en vez de ofrecer un botón "Simular entrega": simular
    // implicaría escribir estados falsos de venta en la base de datos de
    // PRODUCCIÓN (producto vendido, orden completada, correos y comprobantes en
    // PDF saliendo de verdad hacia gente real). Es más superficie y más riesgo
    // que beneficio en el camino del dinero.
    if (enModoPrueba(request)) {
      return bloqueadoPorModoPrueba(
        "Modo prueba: no se puede confirmar la entrega porque eso liberaría un pago real. Esta acción está deshabilitada hasta el lanzamiento."
      );
    }

    // Aquí NO va el candado del documento, y es a propósito. Para llegar a este punto el
    // comprador ya pagó, y pagar sí lo exige. Volver a pedirlo abriría una trampa fea: si su
    // verificación cambia de estado entre que paga y que recibe, no podría confirmar y su
    // plata quedaría atrapada en custodia. Más abajo se comprueba que sea el comprador de
    // esta orden en concreto, que es la autorización que de verdad importa acá.
    const { session, response: authError } = await requireSesion();
    if (authError) return authError;

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

    // Rastro de auditoría: confirmar la entrega libera la custodia (producto SOLD, orden
    // COMPLETADA) y habilita el pago al vendedor — es la acción de plata más sensible del
    // comprador y hasta ahora no dejaba registro de quién ni cuándo la ejecutó.
    await registrarAuditoria({
      userId: session.user.id,
      action: "CONFIRMAR_ENTREGA",
      entity: "Order",
      entityId: orden?.id ?? productId,
      metadata: {
        productId,
        orderId: orden?.id ?? null,
        metodoPago: orden?.metodoPago ?? null,
        totalPagado: orden ? Number(orden.totalPagado) : null,
        recibeVendedor: orden ? Number(orden.recibeVendedor) : null,
      },
      request,
    });

    // Aviso en tiempo real: la factura en vivo de ambas partes pasa a "Completado".
    try {
      const io = (global as any).io;
      if (io) io.to(`product-${productId}`).emit("product-status-changed", { productId, status: "SOLD" });
    } catch {}

    // Comprobante de cierre en PDF, adjunto por correo a comprador y vendedor. Un fallo
    // aquí NO debe tumbar la confirmación de entrega (ya quedó guardada arriba).
    let comprobantePdf: Buffer | null = null;
    let compradorNombre: string | null = null;
    if (orden) {
      try {
        const compradorUser = await prisma.user.findUnique({ where: { email: orden.buyerEmail }, select: { name: true } });
        compradorNombre = compradorUser?.name ?? null;
        comprobantePdf = await generarComprobantePDF({
          ordenId: orden.id,
          fecha: orden.createdAt,
          estado: "COMPLETADO",
          metodoPago: orden.metodoPago,
          productoTitulo: product.title,
          compradorEmail: orden.buyerEmail,
          compradorNombre,
          vendedorNombre: product.seller?.name,
          vendedorEmail: product.seller?.email,
          comision: orden.comision,
          recibeVendedor: orden.recibeVendedor,
          envioCobrado: orden.envioCobrado,
          totalPagado: orden.totalPagado,
          numeroGuia: orden.numeroGuia,
          transportadora: orden.transportadora,
        });
      } catch (pdfErr) {
        console.error('Error generando comprobante PDF:', pdfErr);
      }
    }
    const adjuntoComprobante = comprobantePdf
      ? [{ filename: `comprobante-colbisnes-${(orden?.id || productId).slice(-8)}.pdf`, content: comprobantePdf }]
      : undefined;

    // Correo al VENDEDOR (con el comprobante adjunto)
    if (product.seller) {
      try {
        const montoVendedor = orden?.recibeVendedor != null ? Number(orden.recibeVendedor) : Number(product.priceCOP);
        const html = colbisnesEmailTemplate({
          preheader: "Tu pago está en proceso de liberación",
          titulo: "¡Entrega confirmada! ⭐",
          cuerpo: `Hola ${product.seller.name || 'Vendedor'}, el comprador confirmó que recibió <strong>${product.title}</strong> en buen estado.<br/><br/>Tu pago de <strong style="color:#1F6BFF;">$${montoVendedor.toLocaleString('es-CO')} COP</strong> está en proceso de liberación y lo recibirás pronto.<br/><br/>Adjuntamos el <strong>comprobante de la transacción</strong> en PDF. ¡Gracias por vender en Colbisnes!`,
          ctaTexto: "Ver mis ventas",
          ctaUrl: "https://colbisnes.com",
        });
        await sendEmail({ to: product.seller.email, subject: 'Entrega confirmada - Colbisnes', html, attachments: adjuntoComprobante });
        await sendWhatsapp({
          to: (product.seller as any).phoneWhatsapp,
          body: `⭐ *Colbisnes* - Entrega confirmada!\n\nHola ${product.seller.name || 'Vendedor'}, el comprador confirmó la entrega de *${product.title}*.\n\nTu pago de $${montoVendedor.toLocaleString('es-CO')} COP está en proceso de liberación.`,
        });
        await sendWhatsapp({
          to: process.env.ADMIN_WHATSAPP || '',
          body: `🔔 *ADMIN* - Pago pendiente de liberar\n\nProducto: ${product.title}\nVendedor: ${product.seller.name || 'Sin nombre'}\nMonto: $${montoVendedor.toLocaleString('es-CO')} COP\n\nIngresa al panel admin para liberar el pago.`,
        });
      } catch (emailError) {
        console.error('Error enviando notificación de entrega al vendedor:', emailError);
      }
    }

    // Correo al COMPRADOR (con el mismo comprobante) — cierre formal de la transacción
    if (orden?.buyerEmail) {
      try {
        const html = colbisnesEmailTemplate({
          preheader: "Tu comprobante de compra en Colbisnes",
          titulo: "¡Compra completada! ✅",
          cuerpo: `Hola ${compradorNombre || 'Comprador'}, confirmaste la entrega de <strong>${product.title}</strong>. ¡Gracias por comprar en Colbisnes!<br/><br/>Adjuntamos el <strong>comprobante de la transacción</strong> en PDF con el detalle completo de tu compra. Con esto tu transacción queda finalizada.`,
          ctaTexto: "Ver mis compras",
          ctaUrl: "https://colbisnes.com",
        });
        await sendEmail({ to: orden.buyerEmail, subject: 'Comprobante de tu compra - Colbisnes', html, attachments: adjuntoComprobante });
      } catch (emailError) {
        console.error('Error enviando comprobante al comprador:', emailError);
      }
    }

    return NextResponse.json({ success: true, product: updated });
  } catch (error) {
    console.error("POST /api/payments/confirm-delivery error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
