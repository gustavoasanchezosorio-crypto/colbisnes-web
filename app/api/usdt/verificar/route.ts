import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const USDT_BEP20_CONTRACT = "0x55d398326f99059fF775485246999027B3197955";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TOLERANCIA = 0.5;
const RANGO_BLOQUES = 45000;

function walletATopic(wallet: string): string {
  const limpio = wallet.toLowerCase().replace("0x", "");
  return "0x" + "0".repeat(24) + limpio;
}

export async function GET(req: NextRequest) {
  try {
    const orderId = req.nextUrl.searchParams.get("orderId");
    if (!orderId) return NextResponse.json({ error: "orderId requerido" }, { status: 400 });

    const orden = await prisma.order.findUnique({ where: { id: orderId } });
    if (!orden) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });

    const wallet = process.env.NEXT_PUBLIC_USDT_WALLET;

    if (orden.estado !== "ESPERANDO_PAGO_CRYPTO") {
      return NextResponse.json({ estado: orden.estado, yaConfirmado: true, wallet });
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
    const bloqueDesde = Math.max(0, bloqueActual - RANGO_BLOQUES);

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
      return NextResponse.json({ estado: orden.estado, encontrado: false, debug: data.error.message, wallet });
    }

    const logs = data.result || [];
    let txEncontrada = null;

    for (const log of logs) {
      const valorHex = log.data;
      const valorRaw = BigInt(valorHex);
      const valor = Number(valorRaw) / 1e18;
      console.log("  log -> tx:", log.transactionHash, "valor:", valor);
      if (Math.abs(valor - montoEsperado) <= TOLERANCIA) {
        txEncontrada = log;
        break;
      }
    }

    if (txEncontrada) {
      await prisma.order.update({ where: { id: orderId }, data: { estado: "PAGADO" } });
      await prisma.product.update({ where: { id: orden.productId }, data: { status: "IN_ESCROW" } });
      return NextResponse.json({ estado: "PAGADO", encontrado: true, txHash: txEncontrada.transactionHash });
    }

    return NextResponse.json({ estado: orden.estado, encontrado: false, totalLogsRevisados: logs.length, wallet });
  } catch (err: any) {
    console.error("Error verificando USDT:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
