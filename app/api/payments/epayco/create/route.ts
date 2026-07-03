import { NextResponse } from "next/server";

// ePayco fue removido de Colbisnes. Usa Wompi como pasarela de pago.
export async function POST() {
  return NextResponse.json(
    { error: "ePayco no está disponible. Usa Wompi para realizar tu pago." },
    { status: 410 }
  );
}
