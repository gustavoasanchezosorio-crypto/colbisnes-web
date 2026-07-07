import { NextResponse } from "next/server";
import { obtenerTasaUSDT } from "@/lib/tasaUsdt";

export async function GET() {
  const { tasa, fuente } = await obtenerTasaUSDT();
  return NextResponse.json({ tasa, fuente, ok: true });
}
