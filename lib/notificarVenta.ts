import { prisma } from "@/lib/prisma";
import { sendWhatsapp } from "@/lib/whatsapp";

// Aviso por WhatsApp al vendedor cuando su producto pasa a estar REALMENTE vendido (plata
// confirmada o comisión de reserva confirmada), no cuando se crea la orden "PENDIENTE"/
// "ESPERANDO_COMISION" — en esos estados el comprador puede abandonar el pago y el vendedor
// no tiene nada que hacer todavía. Antes de esto, un vendedor solo se enteraba de que vendió
// si entraba manualmente a revisar sus productos: no había NINGÚN aviso automático en 3 de
// los 4 caminos que confirman una venta (online Wompi/Nequi, comisión de contraentrega
// confirmada por Wompi, confirmación manual del admin) — solo el pago en USDT lo tenía
// (ver app/api/usdt/verificar/route.ts). Se centraliza aquí para que los cuatro manden el
// mismo mensaje y no se vuelvan a desincronizar entre sí.
//
// Nunca lanza: un fallo de WhatsApp (Twilio caído, número inválido, etc.) no debe tumbar el
// webhook de pago ni el checkout — la plata ya está confirmada, avisar es best-effort.
export async function notificarVentaVendedor(ordenId: string) {
  try {
    // Order no tiene relación declarada a Product en el schema (solo productId escalar),
    // así que hace falta una segunda consulta — no se puede resolver con un solo include.
    const orden = await prisma.order.findUnique({
      where: { id: ordenId },
      select: { productId: true, recibeVendedor: true },
    });
    if (!orden) return;

    const producto = await prisma.product.findUnique({
      where: { id: orden.productId },
      select: {
        title: true,
        seller: { select: { name: true, phoneWhatsapp: true } },
      },
    });

    const vendedor = producto?.seller;
    if (!vendedor?.phoneWhatsapp) return;

    const monto = orden.recibeVendedor.toLocaleString("es-CO");

    await sendWhatsapp({
      to: vendedor.phoneWhatsapp,
      body:
        `🎉 *Colbisnes* - ¡Vendiste!\n\n` +
        `Hola ${vendedor.name || "Vendedor"}, vendiste *${producto!.title}*.\n\n` +
        `Recibirás $${monto} COP una vez se complete la entrega. Alista el envío desde la app.`,
    });
  } catch (err) {
    console.error("Error enviando WhatsApp de nueva venta:", err);
  }
}
