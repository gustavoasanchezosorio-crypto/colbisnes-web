import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { obtenerSaldoUSDT, obtenerSaldoBNB } from "@/lib/hotWallet";

function esAdmin(email?: string | null) {
  return !!email && email.toLowerCase() === process.env.ADMIN_EMAIL?.toLowerCase();
}

// GET: información pública de la hot wallet (dirección + saldos) para que el admin
// sepa a dónde depositar fondos para habilitar los desembolsos automáticos.
// La dirección es pública (no es un secreto), solo la private key lo es y nunca se expone aquí.
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!esAdmin(session?.user?.email)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const address = process.env.HOT_WALLET_ADDRESS;
    if (!address) {
      return NextResponse.json({ error: "HOT_WALLET_ADDRESS no configurada" }, { status: 500 });
    }

    const [saldoUSDT, saldoBNB] = await Promise.all([
      obtenerSaldoUSDT(address),
      obtenerSaldoBNB(address),
    ]);

    return NextResponse.json({ address, saldoUSDT, saldoBNB });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error interno" }, { status: 500 });
  }
}
