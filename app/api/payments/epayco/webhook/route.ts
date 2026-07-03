import { NextResponse } from "next/server";

// ePayco fue removido de Colbisnes.
export async function POST() {
  return NextResponse.json(
    { error: "ePayco no está disponible." },
    { status: 410 }
  );
}
