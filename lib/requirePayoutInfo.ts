import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Marcador para que el frontend redirija al perfil a completar los datos.
export const PAYOUT_ERROR = {
  error: "Debes registrar tu Nequi y tu llave Bre-B en tu perfil antes de comprar o vender. Ve a colbisnes.com/perfil/editar",
  payoutRequired: true,
};

/**
 * Verifica que el usuario tenga configurados AMBOS métodos de cobro en pesos:
 * Nequi (nequiNumber) y llave BreB (brebId). Sin esto, cualquier pago que le
 * corresponda (payout de venta o reembolso de compra) puede quedar sin destino.
 *
 * Retorna null si todo está OK, o un NextResponse con el error 403 listo para retornar.
 *
 * Uso:
 *   const faltaPago = await requirePayoutInfo(session.user.id);
 *   if (faltaPago) return faltaPago;
 */
export async function requirePayoutInfo(userId: string): Promise<NextResponse | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { nequiNumber: true, brebId: true },
  });

  const tieneNequi = !!user?.nequiNumber && user.nequiNumber.trim().length > 0;
  const tieneBreb = !!user?.brebId && user.brebId.trim().length > 0;

  if (!tieneNequi || !tieneBreb) {
    return NextResponse.json(PAYOUT_ERROR, { status: 403 });
  }
  return null;
}
