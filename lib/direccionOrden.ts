import { prisma } from "@/lib/prisma";

/* Copia de la dirección de envío que se guarda en cada orden.
 *
 * Va en un archivo aparte de lib/direccion.ts a propósito: ese lo importa la pantalla
 * de editar perfil, o sea que viaja al navegador, y no puede arrastrar prisma consigo.
 * Este es solo de servidor.
 *
 * Por qué se copia en vez de consultarse: ver el comentario del campo en el esquema.
 * En resumen — la orden tiene que recordar a dónde se despachó ESE paquete aunque el
 * comprador cambie su perfil después.
 *
 * Se llama desde los tres sitios donde nace una orden (pago online, contra entrega y
 * USDT) para que no se separen: si mañana se agrega un cuarto método de pago y se
 * olvida esta línea, la orden nace sin dirección y el vendedor vuelve a quedar a
 * ciegas — que es exactamente el problema que esto viene a cerrar.
 */
export async function direccionParaOrden(
  userId: string,
  tipoEntrega: string
): Promise<string | null> {
  // Entrega en persona: no hay paquete que despachar, así que no se guarda dirección.
  // Pedirla ahí sería recoger un dato personal que no se va a usar para nada.
  if (tipoEntrega === "EN_PERSONA") return null;

  const usuario = await prisma.user.findUnique({
    where: { id: userId },
    select: { direccionEnvio: true },
  });

  const direccion = (usuario?.direccionEnvio || "").trim();
  return direccion || null;
}

/* Estados en los que el paquete TODAVÍA no ha salido. Mientras la orden esté en uno de
 * estos, la dirección se puede corregir; de EN_CAMINO en adelante ya no, porque el
 * paquete está en manos de la transportadora con la guía impresa y cambiar el dato en
 * pantalla no lo redirige — solo borraría el rastro de a dónde se mandó de verdad. */
const ESTADOS_ANTES_DE_DESPACHAR = [
  "PENDIENTE",
  "ESPERANDO_COMISION",
  "ESPERANDO_PAGO_CRYPTO",
  "PAGADO",
  "ESPERANDO_ENVIO",
];

/**
 * Pone al día la dirección de una orden que ya existía.
 *
 * Los tres caminos de pago reutilizan la orden pendiente en vez de crear otra cuando el
 * comprador vuelve a intentarlo. Sin esto, alguien que abandona el pago, corrige su
 * dirección en la pantalla de confirmación y vuelve a entrar, se queda con la dirección
 * del primer intento: confirmaría una en pantalla y el vendedor despacharía a la otra.
 */
export async function refrescarDireccionOrden<
  T extends { id: string; estado: string; direccionEnvio: string | null }
>(orden: T, userId: string, tipoEntrega: string): Promise<T> {
  if (!ESTADOS_ANTES_DE_DESPACHAR.includes(orden.estado)) return orden;

  const direccionEnvio = await direccionParaOrden(userId, tipoEntrega);
  if (direccionEnvio === orden.direccionEnvio) return orden;

  const actualizada = await prisma.order.update({
    where: { id: orden.id },
    data: { direccionEnvio },
  });
  return actualizada as unknown as T;
}
