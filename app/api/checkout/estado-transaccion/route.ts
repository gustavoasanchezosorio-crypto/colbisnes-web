import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { consultarTransaccion } from "@/lib/wompi";

// El frontend consulta aquí el estado de un cobro Nequi push mientras el comprador aprueba en su
// app. Devuelve el estado tal cual lo reporta Wompi (APPROVED / DECLINED / PENDING / ERROR / VOIDED).
// La actualización real de la orden y el producto la hace el webhook; esto es solo para la UI.
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const transactionId = req.nextUrl.searchParams.get("transactionId");
    if (!transactionId) return NextResponse.json({ error: "transactionId requerido" }, { status: 400 });

    const tx = await consultarTransaccion(transactionId);
    return NextResponse.json({ status: tx.status });
  } catch (err: any) {
    console.error("Error consultando transacción Wompi:", err.message);
    return NextResponse.json({ error: "No se pudo consultar el estado" }, { status: 500 });
  }
}
