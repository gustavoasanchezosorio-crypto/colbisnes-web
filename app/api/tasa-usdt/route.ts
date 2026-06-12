import { NextResponse } from "next/server";

export async function GET() {
  try {
    const res  = await fetch("https://api.exchangerate-api.com/v4/latest/USD", { next: { revalidate: 300 } });
    const data = await res.json();
    const tasa = data.rates?.COP;
    if (!tasa) throw new Error("No se pudo obtener tasa");
    return NextResponse.json({ tasa, fuente: "exchangerate-api", ok: true });
  } catch {
    // fallback tasa manual si falla la API
    return NextResponse.json({ tasa: 4200, fuente: "fallback", ok: true });
  }
}
