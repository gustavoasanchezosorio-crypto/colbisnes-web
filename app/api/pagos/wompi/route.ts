import { NextResponse } from "next/server";
// Ruta legacy — el checkout real está en /api/checkout/wompi
export async function POST() {
  return NextResponse.json({ error: "Usa /api/checkout/wompi" }, { status: 410 });
}
