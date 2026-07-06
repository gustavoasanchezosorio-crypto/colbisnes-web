import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { DESTACADO_DIAS } from "@/lib/pricing";

async function procesarWebhookDestacado(reference: string, status: string) {
  const featured = await prisma.featuredListing.findUnique({ where: { wompiReference: reference } });
  if (!featured) {
    console.error("FeaturedListing no encontrado para referencia:", reference);
    return NextResponse.json({ error: "Solicitud de destacado no encontrada" }, { status: 404 });
  }

  if (status === "APPROVED" && featured.estado !== "PAGADO") {
    const ahora = new Date();
    const expiraAt = new Date(ahora.getTime() + featured.dias * 24 * 60 * 60 * 1000);
    await prisma.$transaction([
      prisma.featuredListing.update({
        where: { id: featured.id },
        data: { estado: "PAGADO", activadoAt: ahora, expiraAt },
      }),
      prisma.product.update({
        where: { id: featured.productId },
        data: { featuredUntil: expiraAt },
      }),
    ]);
  } else if (status === "DECLINED" || status === "VOIDED" || status === "ERROR") {
    await prisma.featuredListing.update({
      where: { id: featured.id },
      data: { estado: status === "DECLINED" ? "RECHAZADO" : "ERROR" },
    });
  }

  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("Webhook Wompi recibido:", JSON.stringify(body));

    const event     = body.event;
    const data      = body.data;
    const signature = body.signature;
    const timestamp = body.timestamp;

    if (!event || !data || !signature || !timestamp) {
      return NextResponse.json({ error: "Payload incompleto" }, { status: 400 });
    }

    const properties = signature.properties as string[];
    if (!Array.isArray(properties) || !signature.checksum) {
      return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
    }

    // Los campos que esta ruta usa para decidir a qué estado pasa la orden y por cuánto
    // dinero DEBEN estar siempre cubiertos por la firma. Antes `properties` se tomaba tal
    // cual del body (atacante): si alguien lograba reutilizar un checksum válido de OTRO
    // evento real firmando solo, por ejemplo, "transaction.id", podía cambiar status/amount
    // libremente sin invalidar la firma, porque esos campos habrían quedado fuera de lo
    // firmado. Exigimos aquí el set estándar que Wompi firma por defecto para
    // transaction.updated (auditoría 2026-07-06).
    const CAMPOS_REQUERIDOS = ["transaction.id", "transaction.status", "transaction.amount_in_cents"];
    if (!CAMPOS_REQUERIDOS.every((campo) => properties.includes(campo))) {
      console.error("Webhook Wompi rechazado: signature.properties no cubre los campos requeridos:", properties);
      return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
    }

    const secret = process.env.WOMPI_EVENTS_SECRET;
    if (!secret) {
      // Fail closed: antes, si la env var no estaba configurada, `secret` quedaba literalmente
      // como el string "undefined" y el webhook seguía procesándose (fail open) — auditoría
      // 2026-07-06. Sin secreto no hay nada que verificar, así que rechazamos de una vez.
      console.error("WOMPI_EVENTS_SECRET no está configurado — rechazando webhook");
      return NextResponse.json({ error: "Configuración de servidor incompleta" }, { status: 500 });
    }

    let valoresConcatenados = "";
    for (const prop of properties) {
      const partes = prop.split(".");
      let valor: any = data;
      for (const p of partes) valor = valor?.[p];
      valoresConcatenados += String(valor);
    }

    const cadenaCompleta = valoresConcatenados + timestamp + secret;
    const firmaCalculada = crypto.createHash("sha256").update(cadenaCompleta).digest("hex");

    // Comparación de tiempo constante — antes era `!==` directo sobre strings, vulnerable a
    // timing attacks (auditoría 2026-07-06). Si el checksum recibido no es hex válido del
    // mismo largo que el calculado, se trata como inválido sin invocar timingSafeEqual (que
    // lanza una excepción si los buffers tienen longitudes distintas).
    const bufCalculada = Buffer.from(firmaCalculada, "hex");
    const bufRecibida  = Buffer.from(String(signature.checksum || ""), "hex");
    const firmaValida =
      bufCalculada.length === bufRecibida.length &&
      bufCalculada.length > 0 &&
      crypto.timingSafeEqual(bufCalculada, bufRecibida);

    if (!firmaValida) {
      console.error("Firma invalida en webhook Wompi");
      return NextResponse.json({ error: "Firma invalida" }, { status: 401 });
    }

    // Wompi puede reintentar durante horas — ventana de 24h para no rechazar reintentos legítimos
    const webhookAge = Date.now() - Number(timestamp) * 1000;
    if (webhookAge > 24 * 60 * 60 * 1000) {
      return NextResponse.json({ error: "Webhook expirado" }, { status: 400 });
    }

    if (event !== "transaction.updated") {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const transaction = data.transaction;
    const reference    = transaction.reference as string;
    const status       = transaction.status;
    const transactionId = transaction.id as string;

    // Pagos de "destacar producto" usan un flujo separado (no son una Order de compra)
    if (reference.startsWith("destacado")) {
      return await procesarWebhookDestacado(reference, status);
    }

    // La referencia tiene el formato: "colbisnes" + orden.id (cuid, ~25 caracteres) + timestamp (13 dígitos)
    let ordenId = "";
    if (reference.startsWith("colbisnes")) {
      const sinPrefijo = reference.slice("colbisnes".length);
      ordenId = sinPrefijo.slice(0, sinPrefijo.length - 13);
    } else {
      ordenId = reference;
    }

    console.log("Referencia completa:", reference);
    console.log("OrdenId extraído:", ordenId);
    console.log("TransactionId Wompi:", transactionId);

    let orden = await prisma.order.findUnique({ where: { id: ordenId } });

    // Fallback: si no se encuentra con el recorte exacto, buscar por coincidencia parcial
    if (!orden) {
      const candidatos = await prisma.order.findMany({
        where: { estado: "PENDIENTE" },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
      orden = candidatos.find((o) => reference.includes(o.id)) || null;
      if (orden) console.log("Orden encontrada por fallback de búsqueda parcial:", orden.id);
    }

    if (!orden) {
      console.error("Orden no encontrada para referencia:", reference, "ordenId extraído:", ordenId);
      return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
    }

    // Idempotencia: si ya está en estado final, ignorar reintento
    if (status === "APPROVED" && orden.estado === "PAGADO") {
      console.log("Webhook duplicado ignorado para orden:", orden.id);
      return NextResponse.json({ ok: true, duplicate: true });
    }
    if (
      (status === "DECLINED" && orden.estado === "RECHAZADO") ||
      (status === "VOIDED"   && orden.estado === "ANULADO") ||
      (status === "ERROR"    && orden.estado === "ERROR")
    ) {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    let nuevoEstado = orden.estado;
    if (status === "APPROVED")      nuevoEstado = "PAGADO";
    else if (status === "DECLINED") nuevoEstado = "RECHAZADO";
    else if (status === "VOIDED")   nuevoEstado = "ANULADO";
    else if (status === "ERROR")    nuevoEstado = "ERROR";

    if (status === "APPROVED") {
      // Verificación cruzada del monto: el checksum prueba que Wompi firmó ESTOS valores,
      // pero no que coincidan con lo que esta orden realmente debía cobrar. Sin esto, una
      // referencia reciclada o mal extraída podría confirmar el pago de una orden cara usando
      // la firma válida de una transacción real pero de menor monto — auditoría 2026-07-06.
      const montoEsperadoCentavos = orden.totalPagado * 100;
      if (typeof transaction.amount_in_cents === "number" && transaction.amount_in_cents !== montoEsperadoCentavos) {
        console.error(
          `Webhook Wompi rechazado: amount_in_cents (${transaction.amount_in_cents}) no coincide con el total esperado de la orden ${orden.id} (${montoEsperadoCentavos})`
        );
        return NextResponse.json({ error: "Monto no coincide con la orden" }, { status: 400 });
      }

      // Transacción atómica: actualizar orden Y producto al mismo tiempo
      await prisma.$transaction([
        prisma.order.update({
          where: { id: orden.id },
          data: { estado: nuevoEstado },
        }),
        prisma.product.update({
          where: { id: orden.productId },
          data: {
            status: "IN_ESCROW",
            paidAt: new Date(),
            paymentExpiresAt: null,
          },
        }),
      ]);
    } else {
      await prisma.order.update({
        where: { id: orden.id },
        data: { estado: nuevoEstado },
      });

      // Si fue rechazado/anulado, el producto vuelve a AVAILABLE para que el comprador pueda reintentar
      if (status === "DECLINED" || status === "VOIDED" || status === "ERROR") {
        await prisma.product.update({
          where: { id: orden.productId },
          data: { status: "AVAILABLE", paymentExpiresAt: null },
        });
      }
    }

    console.log("Orden " + orden.id + " actualizada a estado " + nuevoEstado);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Error en webhook Wompi:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
