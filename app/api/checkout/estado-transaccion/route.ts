import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { consultarTransaccion } from "@/lib/wompi";
import { prisma } from "@/lib/prisma";

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

    // Solo el comprador dueño de la orden asociada puede consultar el estado. La referencia de
    // la transacción Wompi tiene el formato: prefijo ("colbisnes"/"comision") + orderId + timestamp
    // (13 dígitos). Extraemos el orderId igual que el webhook y verificamos que la orden sea del
    // usuario. Evita que cualquier usuario autenticado espíe el estado de pagos ajenos adivinando
    // un transactionId. Fail-closed: si no logramos identificar/verificar la orden, denegamos.
    const referencia: string = tx.reference || "";
    let prefijo = "";
    if (referencia.startsWith("comision")) prefijo = "comision";
    else if (referencia.startsWith("colbisnes")) prefijo = "colbisnes";

    if (!prefijo) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

    const sinPrefijo = referencia.slice(prefijo.length);
    const ordenId = sinPrefijo.slice(0, sinPrefijo.length - 13);
    const orden = await prisma.order.findUnique({ where: { id: ordenId }, select: { buyerEmail: true } });
    if (!orden || orden.buyerEmail.toLowerCase() !== session.user.email.toLowerCase()) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    return NextResponse.json({ status: tx.status });
  } catch (err: any) {
    console.error("Error consultando transacción Wompi:", err.message);
    return NextResponse.json({ error: "No se pudo consultar el estado" }, { status: 500 });
  }
}
