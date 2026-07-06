import { NextResponse } from "next/server";

// Tasa real de venta de USDT en el mercado P2P de Binance (lo que se obtiene al
// convertir USDT a COP), distinta de la tasa oficial USD/COP. tradeType "SELL"
// = nosotros vendiendo USDT, así que Binance devuelve anuncios de gente comprando.
// Se promedian los mejores 5 anuncios para no depender de uno solo con rango de
// monto angosto (posible outlier de un anuncio poco representativo).
async function tasaBinanceP2P(): Promise<number | null> {
  const res = await fetch("https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ asset: "USDT", fiat: "COP", tradeType: "SELL", page: 1, rows: 5, payTypes: [] }),
  });
  const data = await res.json();
  const precios: number[] = (data?.data ?? [])
    .map((a: any) => parseFloat(a.adv.price))
    .filter((p: number) => !isNaN(p));
  if (!precios.length) return null;
  return precios.reduce((a: number, b: number) => a + b, 0) / precios.length;
}

async function tasaExchangeRateApi(): Promise<number | null> {
  const res  = await fetch("https://api.exchangerate-api.com/v4/latest/USD", { cache: "no-store" });
  const data = await res.json();
  return data.rates?.COP ?? null;
}

export async function GET() {
  try {
    const tasa = await tasaBinanceP2P();
    if (tasa) return NextResponse.json({ tasa, fuente: "binance-p2p", ok: true });
  } catch {}
  try {
    const tasa = await tasaExchangeRateApi();
    if (tasa) return NextResponse.json({ tasa, fuente: "exchangerate-api", ok: true });
  } catch {}
  return NextResponse.json({ tasa: 4200, fuente: "fallback", ok: true });
}
