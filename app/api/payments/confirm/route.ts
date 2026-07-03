import { NextResponse } from "next/server";

// Este endpoint fue deshabilitado por seguridad.
// El flujo correcto es: Wompi webhook → IN_ESCROW → confirm-delivery → SOLD
// No existe una ruta directa para marcar un producto como SOLD sin verificación.
export async function POST() {
  return NextResponse.json(
    { error: "Este endpoint ha sido deshabilitado. Usa el flujo de pago oficial de Colbisnes." },
    { status: 403 }
  );
}
