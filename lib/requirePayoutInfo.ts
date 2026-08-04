import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Marcador para que el frontend redirija al perfil a completar los datos.
export const PAYOUT_ERROR = {
  error: "Debes registrar tu Nequi y tu llave Bre-B en tu perfil antes de comprar o vender. Ve a colbisnes.com/perfil/editar",
  payoutRequired: true,
};

/**
 * ¿Este usuario tiene a dónde recibir plata? Exige AMBOS métodos de cobro en
 * pesos: Nequi (nequiNumber) y llave Bre-B (brebId).
 *
 * Se comprueba en el momento en que el dinero se va a mover, NO al publicar.
 * El motivo es que los dos campos se pueden vaciar después desde el perfil
 * (PATCH /api/user los copia tal cual, y aceptan cadena vacía), así que un
 * candado puesto al publicar no garantiza nada más tarde: se podía publicar
 * con datos, borrarlos y vender igual. Comprobarlo justo antes de la compra sí
 * garantiza que ninguna orden entra en custodia sin destino de pago.
 */
export async function tieneDatosDeCobro(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { nequiNumber: true, brebId: true },
  });

  const tieneNequi = !!user?.nequiNumber && user.nequiNumber.trim().length > 0;
  const tieneBreb = !!user?.brebId && user.brebId.trim().length > 0;

  return tieneNequi && tieneBreb;
}

/**
 * Igual que tieneDatosDeCobro, pero devuelve directamente el 403 para el
 * usuario de la sesión. Se usa en el checkout con el COMPRADOR: si le hay que
 * devolver la plata (reembolso, disputa), el reembolso necesita destino.
 *
 * Retorna null si todo está OK, o un NextResponse con el error 403 listo para retornar.
 *
 * Uso:
 *   const faltaPago = await requirePayoutInfo(session.user.id);
 *   if (faltaPago) return faltaPago;
 */
export async function requirePayoutInfo(userId: string): Promise<NextResponse | null> {
  if (await tieneDatosDeCobro(userId)) return null;
  return NextResponse.json(PAYOUT_ERROR, { status: 403 });
}
