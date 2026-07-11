import { NextResponse } from "next/server";
// PayPal no está disponible. El pago real usa Wompi.
export async function GET() {
  return NextResponse.redirect("https://colbisnes.com", { status: 302 });
}
