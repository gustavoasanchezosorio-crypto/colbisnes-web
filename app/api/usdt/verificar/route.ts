import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { sendWhatsapp } from "@/lib/whatsapp";
import { colbisnesEmailTemplate } from "@/lib/emailTemplate";

const USDT_BEP20_CONTRACT = "0x55d398326f99059fF775485246999027B3197955";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
// Pagar de MÁS nunca es un problema para Colbisnes, así que no hay límite superior.
// Pagar de MENOS solo se tolera hasta este margen, para absorber comisiones de red/retiro
// que cobran algunos exchanges/wallets al enviar (varían y están fuera de nuestro control) —
// más allá de esto, la orden se queda pendiente para revisión manual en vez de auto-aceptarse.
const TOLERANCIA_PAGO_DE_MENOS = 0.30;
// Margen de seguridad antes de la creación de la orden, por si hay desfase de reloj entre servidor y nodo BSC.
const MARGEN_SEGUNDOS = 300;

function walletATopic(wallet: string): string {
  const limpio = wallet.toLowerCase().replace("0x", "");
  return "0x" + "0".repeat(24) + limpio;
}

async function obtenerBloque(url: string, numero: number): Promise<{ timestamp: number } | null> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "eth_getBlockByNumber", params: ["0x" + numero.toString(16), false], id: 3 }),
  });
  const data = await res.json();
  if (!data.result) return null;
  return { timestamp: parseInt(data.result.timestamp, 16) };
}

// El tiempo de bloque de BSC ha cambiado varias veces por hardforks de la red (de ~3s
// bajó a ~1.5s y luego más) — un valor fijo se queda desactualizado y hace que el rango
// de búsqueda empiece DESPUÉS del pago real, perdiéndolo por completo (confirmado en
// producción el 2026-07-06: con un valor fijo de 3s/bloque, el rango calculado excluyó
// una transacción real que sí llegó a la wallet). En vez de asumir un valor, lo medimos
// comparando el bloque actual con uno ~2000 bloques atrás.
async function segundosPorBloque(url: string, bloqueActual: number): Promise<number> {
  const muestra = Math.max(0, bloqueActual - 2000);
  const [actual, anterior] = await Promise.all([obtenerBloque(url, bloqueActual), obtenerBloque(url, muestra)]);
  const deltaBloques = bloqueActual - muestra;
  if (!actual || !anterior || deltaBloques <= 0) return 1; // respaldo conservador si algo falla
  const deltaSegundos = actual.timestamp - anterior.timestamp;
  if (deltaSegundos <= 0) return 1;
  // Margen adicional del 50% por si la red se pone más rápida entre esta medición y la búsqueda.
  return (deltaSegundos / deltaBloques) * 0.5;
}

export async function GET(req: NextRequest) {
  try {
    const orderId = req.nextUrl.searchParams.get("orderId");
    if (!orderId) return NextResponse.json({ error: "orderId requerido" }, { status: 400 });

    const orden = await prisma.order.findUnique({ where: { id: orderId } });
    if (!orden) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });

    const wallet = process.env.NEXT_PUBLIC_USDT_WALLET;

    // paymentExpiresAt vive en el producto (no en la orden). Se devuelve al cliente para
    // que pueda pintar un contador real hacia atrás, en vez de un texto fijo "10 minutos"
    // que no reflejaba el tiempo restante verdadero (reportado por el usuario 2026-07-07).
    const productoPlazo = await prisma.product.findUnique({
      where: { id: orden.productId },
      select: { paymentExpiresAt: true },
    });
    const paymentExpiresAt = productoPlazo?.paymentExpiresAt ?? null;

    if (orden.estado !== "ESPERANDO_PAGO_CRYPTO") {
      return NextResponse.json({ estado: orden.estado, yaConfirmado: true, wallet, paymentExpiresAt });
    }

    const meganodeKey = process.env.MEGANODE_API_KEY;
    if (!wallet || !meganodeKey) {
      return NextResponse.json({ error: "Configuracion incompleta" }, { status: 500 });
    }

    const montoEsperado = orden.totalUSDT || 0;
    const url = "https://bsc-mainnet.nodereal.io/v1/" + meganodeKey;

    const blockRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 }),
    });
    const blockData = await blockRes.json();
    const bloqueActual = parseInt(blockData.result, 16);

    // Limitamos la búsqueda a bloques posteriores a la creación de la orden (con margen de seguridad),
    // en vez de una ventana fija de ~36h, para que transferencias antiguas o de otros compradores
    // no puedan "coincidir por casualidad" con una orden nueva.
    const segundosDesdeCreacion = Math.max(0, (Date.now() - new Date(orden.createdAt).getTime()) / 1000);
    const segPorBloque = await segundosPorBloque(url, bloqueActual);
    const bloquesDesdeCreacion = Math.ceil((segundosDesdeCreacion + MARGEN_SEGUNDOS) / segPorBloque);
    const bloqueDesde = Math.max(0, bloqueActual - bloquesDesdeCreacion);

    const logsBody = {
      jsonrpc: "2.0",
      method: "eth_getLogs",
      params: [{
        fromBlock: "0x" + bloqueDesde.toString(16),
        toBlock: "latest",
        address: USDT_BEP20_CONTRACT,
        topics: [TRANSFER_TOPIC, null, walletATopic(wallet)],
      }],
      id: 2,
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(logsBody),
    });
    const data = await res.json();

    console.log("USDT verificar - bloque actual:", bloqueActual, "desde:", bloqueDesde);
    console.log("USDT verificar - logs encontrados:", Array.isArray(data.result) ? data.result.length : data);

    if (data.error) {
      console.error("USDT verificar - error:", data.error.message);
      return NextResponse.json({ estado: orden.estado, encontrado: false, debug: data.error.message, wallet, paymentExpiresAt });
    }

    const logs = data.result || [];
    let txEncontrada = null;

    for (const log of logs) {
      const valorHex = log.data;
      const valorRaw = BigInt(valorHex);
      const valor = Number(valorRaw) / 1e18;
      console.log("  log -> tx:", log.transactionHash, "valor:", valor);
      if (valor >= montoEsperado - TOLERANCIA_PAGO_DE_MENOS) {
        // Un mismo hash de transacción no puede usarse para pagar más de una orden.
        const yaUsado = await prisma.order.findFirst({ where: { txHashPago: log.transactionHash } });
        if (yaUsado) {
          console.warn("USDT verificar - tx ya usada por otra orden, se ignora:", log.transactionHash);
          continue;
        }
        txEncontrada = log;
        break;
      }
    }

    if (txEncontrada) {
      // Verificación final atómica: solo confirma si la orden sigue esperando pago Y ninguna otra
      // orden reclamó este mismo hash mientras tanto (evita condiciones de carrera).
      const actualizado = await prisma.order.updateMany({
        where: { id: orderId, estado: "ESPERANDO_PAGO_CRYPTO", txHashPago: null },
        data: { estado: "PAGADO", txHashPago: txEncontrada.transactionHash },
      });
      if (actualizado.count === 0) {
        return NextResponse.json({ estado: orden.estado, encontrado: false, wallet });
      }
      const producto = await prisma.product.update({
        where: { id: orden.productId },
        data: { status: "IN_ESCROW", paidAt: new Date(), paymentExpiresAt: null },
        include: { seller: true },
      });

      // Notificar a comprador y vendedor que el pago quedó confirmado (antes no se avisaba a nadie)
      try {
        if (producto.seller) {
          const htmlVendedor = colbisnesEmailTemplate({
            preheader: "Pago recibido",
            titulo: "¡Recibiste un pago! 💰",
            cuerpo: `Hola ${producto.seller.name || "Vendedor"}, el pago en USDT por <strong>${producto.title}</strong> fue confirmado en blockchain.<br/><br/>El dinero está protegido por Colbisnes mientras se completa el envío y la entrega.`,
            ctaTexto: "Ver mis ventas",
            ctaUrl: "https://colbisnes.com",
          });
          await sendEmail({ to: producto.seller.email, subject: "Pago recibido - Colbisnes", html: htmlVendedor });
          await sendWhatsapp({
            to: (producto.seller as any).phoneWhatsapp,
            body: `💰 *Colbisnes* - Pago confirmado\n\nHola ${producto.seller.name || "Vendedor"}, se confirmó el pago en USDT por *${producto.title}*.\n\nAlista el envío desde la app.`,
          });
        }
        const htmlComprador = colbisnesEmailTemplate({
          preheader: "Tu pago fue confirmado",
          titulo: "¡Tu pago fue confirmado! ✅",
          cuerpo: `Hola, confirmamos tu pago en USDT por <strong>${producto.title}</strong>.<br/><br/>Tu dinero queda protegido por Colbisnes hasta que confirmes que recibiste el producto.`,
          ctaTexto: "Ver mi compra",
          ctaUrl: "https://colbisnes.com",
        });
        await sendEmail({ to: orden.buyerEmail, subject: "Tu pago fue confirmado - Colbisnes", html: htmlComprador });
      } catch (notifError) {
        console.error("Error enviando notificación de pago USDT confirmado:", notifError);
      }

      return NextResponse.json({ estado: "PAGADO", encontrado: true, txHash: txEncontrada.transactionHash });
    }

    return NextResponse.json({ estado: orden.estado, encontrado: false, totalLogsRevisados: logs.length, wallet, paymentExpiresAt });
  } catch (err: any) {
    console.error("Error verificando USDT:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
