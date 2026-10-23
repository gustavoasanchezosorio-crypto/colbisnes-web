import { NextRequest, NextResponse } from "next/server";
import { obtenerTasaUSDT } from "@/lib/tasaUsdt";
import { rateLimit, getIP } from "@/lib/rateLimit";

export async function GET(req: NextRequest) {
  // Ruta pública sin login (el checkout necesita la tasa antes de que el comprador pague).
  // El caché de obtenerTasaUSDT() ya acota el costo hacia Binance/exchangerate-api, pero se
  // limita también por IP, como el resto de rutas públicas (ver lib/rateLimit.ts).
  const { allowed } = rateLimit(`tasa-usdt:${getIP(req)}`, { limit: 30, windowSeconds: 60 });
  if (!allowed) return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });

  const { tasa, fuente } = await obtenerTasaUSDT();
  return NextResponse.json({ tasa, fuente, ok: true });
}
