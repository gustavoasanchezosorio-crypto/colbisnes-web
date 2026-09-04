import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { obtenerSaldoUSDT, obtenerSaldoBNB } from "@/lib/hotWallet";
import { esAdminSession } from "@/lib/adminAuth";

// Saldos on-chain reales: si esto se sirviera cacheado, el admin podría creer que hay fondos
// suficientes (o insuficientes) para un desembolso cuando el saldo real ya cambió. Igual que
// el resto de rutas admin — ver el comentario en app/api/admin/usuarios/[id]/route.ts.
export const dynamic = "force-dynamic";

// GET: información pública de la hot wallet (dirección + saldos) para que el admin
// sepa a dónde depositar fondos para habilitar los desembolsos automáticos.
// La dirección es pública (no es un secreto), solo la private key lo es y nunca se expone aquí.
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!esAdminSession(session)) {
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

    return NextResponse.json({ address, saldoUSDT, saldoBNB }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error interno" }, { status: 500 });
  }
}
