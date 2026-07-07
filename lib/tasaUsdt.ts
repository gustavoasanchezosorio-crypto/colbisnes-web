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

export interface TasaUSDT {
  tasa: number;
  fuente: "binance-p2p" | "exchangerate-api" | "fallback";
}

// Única fuente de verdad para la tasa USD/COP usada en pagos USDT. Antes existían DOS
// caminos que podían devolver números distintos para la MISMA orden: el checkout (navegador)
// llamaba a /api/tasa-usdt directamente, mientras que la creación de la orden (servidor)
// se auto-llamaba a sí misma por HTTP a `${NEXT_PUBLIC_URL}/api/tasa-usdt` — con
// NEXT_PUBLIC_URL apuntando a un dominio de Vercel ya dado de baja (404) tras la migración a
// Railway. Esa auto-llamada fallaba en silencio y la orden se creaba con el valor de
// respaldo (4200) mientras el checkout sí mostraba la tasa real — descuadre confirmado en
// producción el 2026-07-06 (orden #cmra17eqb: preview 5.1 USDT vs orden creada 4.5 USDT).
// Ahora ambos caminos llaman esta misma función en proceso, sin HTTP de por medio.
export async function obtenerTasaUSDT(): Promise<TasaUSDT> {
  try {
    const tasa = await tasaBinanceP2P();
    if (tasa) return { tasa, fuente: "binance-p2p" };
  } catch {}
  try {
    const tasa = await tasaExchangeRateApi();
    if (tasa) return { tasa, fuente: "exchangerate-api" };
  } catch {}
  // Si llegamos aquí, ambas fuentes de tasa en vivo fallaron — se usa un valor fijo desactualizado
  // para no bloquear el checkout, pero debe quedar visible en logs: si esto se dispara seguido,
  // las órdenes USDT se están creando con una tasa incorrecta sin que nadie se entere.
  console.error("obtenerTasaUSDT: ambas fuentes de tasa en vivo fallaron, usando fallback fijo de 4200 COP/USD");
  return { tasa: 4200, fuente: "fallback" };
}
