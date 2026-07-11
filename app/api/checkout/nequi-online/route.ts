import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { prepararOrdenOnline } from "@/lib/checkoutOnline";
import { crearTransaccionWompi } from "@/lib/wompi";

// Cobro del pago ONLINE completo directo por Nequi (push a la app del comprador), sin pasar por
// el checkout web. Usa la MISMA lógica de orden/precios que /api/checkout/wompi (helper compartido)
// y la MISMA referencia con prefijo "colbisnes", de modo que el webhook existente confirma el pago
// y pasa el producto a IN_ESCROW con la verificación cruzada de monto ya establecida.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const productoId: string = body.productoId || "";
    const proteccionExtendida: boolean = body.proteccionExtendida === true;
    const telefonoRaw: string = String(body.telefono || "");

    const prep = await prepararOrdenOnline(productoId, proteccionExtendida);
    if (!prep.ok) {
      // Devolvemos banderas que el checkout ya sabe interpretar para redirigir al flujo correcto.
      switch (prep.code) {
        case "kyc":               return NextResponse.json({ kycRequired: true }, { status: 403 });
        case "emailVerification": return NextResponse.json({ emailVerificationRequired: true }, { status: 403 });
        case "antiPhishing":      return NextResponse.json({ antiPhishingRequired: true }, { status: 403 });
        case "payout":            return NextResponse.json({ payoutRequired: true }, { status: 403 });
        default:                  return NextResponse.json({ error: prep.message || "No se pudo iniciar el pago" }, { status: prep.status });
      }
    }
    const { orden, session } = prep;

    // Número Nequi: el que envíe el comprador o, por defecto, el registrado en su perfil.
    const usuario = await prisma.user.findUnique({ where: { email: session.user.email }, select: { nequiNumber: true } });
    const telefono = (telefonoRaw || usuario?.nequiNumber || "").replace(/\D/g, "").slice(-10);
    if (telefono.length !== 10) {
      return NextResponse.json({ error: "Ingresa un número Nequi válido de 10 dígitos" }, { status: 400 });
    }

    const referencia = "colbisnes" + orden.id.replace(/[^a-zA-Z0-9]/g, "") + Date.now();
    const amountInCents = Math.round(orden.totalPagado * 100);

    const tx = await crearTransaccionWompi({
      amountInCents,
      currency: "COP",
      customerEmail: session.user.email,
      reference: referencia,
      paymentMethod: { type: "NEQUI", phone_number: telefono },
    });

    // La transacción nace PENDING y Nequi manda el push al celular. El webhook confirmará el pago;
    // el frontend consulta el estado con el transactionId hasta que quede APPROVED/DECLINED.
    return NextResponse.json({ ok: true, transactionId: tx.id, status: tx.status, orderId: orden.id });
  } catch (err: any) {
    console.error("Error en cobro Nequi online:", err.message);
    return NextResponse.json({ error: "No se pudo iniciar el cobro por Nequi. Verifica el número e intenta de nuevo." }, { status: 500 });
  }
}
