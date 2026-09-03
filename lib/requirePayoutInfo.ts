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
 * ¿Este vendedor puede recibir una venta AHORA MISMO? Junta las dos condiciones que hay
 * que cumplir para que entre plata a su nombre: identidad verificada y destino de cobro.
 *
 * Por qué está junto y no en dos llamadas sueltas (2026-09-02): publicar exige el
 * documento, pero esa comprobación se hace UNA vez, cuando se publica. Si después la
 * verificación deja de estar aprobada —porque se revocó, porque se descubrió que se había
 * aprobado a mano sin mirar nada, o porque la persona tiene que rehacerla— la publicación
 * vieja seguía viva y podía seguir recibiendo dinero. El candado de publicar no cubre lo
 * ya publicado; este sí. Al ser una sola función, además, es imposible añadir un cuarto
 * método de pago y acordarse de la mitad de las comprobaciones.
 *
 * El mensaje que se le muestra al comprador es deliberadamente vago y el mismo en los dos
 * casos: al comprador no le incumbe si al vendedor le falta la cédula o el número de Nequi,
 * y distinguirlo sería contarle en qué estado tiene el perfil un tercero.
 */
export async function vendedorPuedeRecibirVentas(sellerId: string): Promise<boolean> {
  const vendedor = await prisma.user.findUnique({
    where: { id: sellerId },
    select: { kycStatus: true, nequiNumber: true, brebId: true },
  });
  if (!vendedor) return false;
  if (vendedor.kycStatus !== "approved") return false;

  const tieneNequi = !!vendedor.nequiNumber && vendedor.nequiNumber.trim().length > 0;
  const tieneBreb = !!vendedor.brebId && vendedor.brebId.trim().length > 0;
  return tieneNequi && tieneBreb;
}

export const MENSAJE_VENDEDOR_NO_LISTO =
  "Este producto no se puede comprar ahora mismo: el vendedor todavía no ha terminado de configurar su cuenta para recibir pagos.";

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
