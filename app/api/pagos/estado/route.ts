import { NextResponse } from "next/server";
// Ruta legacy deshabilitada
export async function GET() {
  return NextResponse.json({ error: "Ruta no disponible" }, { status: 410 });
}
