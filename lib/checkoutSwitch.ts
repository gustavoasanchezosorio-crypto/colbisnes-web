import { prisma } from "@/lib/prisma";

// Estados de orden PREVIOS a un pago real confirmado. En estos estados el comprador
// todavía no ha transferido nada irreversible:
//   - PENDIENTE             → online (Wompi): aún no pasó por la pasarela
//   - ESPERANDO_PAGO_CRYPTO → USDT: aún no envió la transferencia on-chain
//   - ESPERANDO_COMISION    → contra entrega: aún no se confirmó la comisión Nequi
// Por eso es seguro cancelarlas si el comprador decide cambiar de método de pago.
const ESTADOS_PRE_PAGO = ["PENDIENTE", "ESPERANDO_PAGO_CRYPTO", "ESPERANDO_COMISION"];

/**
 * Permite al comprador cambiar de método de pago antes de completar el pago.
 * Si ya tiene una orden pendiente (sin pago confirmado) para este producto con un
 * método DISTINTO al que ahora eligió, la marca CANCELADO para que el flujo del nuevo
 * método pueda crear (o reutilizar) su propia orden sin quedar "pegado" a la anterior.
 *
 * No toca órdenes de otros compradores ni órdenes ya pagadas / en custodia.
 */
export async function cancelarOrdenPendienteDeOtroMetodo(
  productId: string,
  buyerEmail: string,
  metodoNuevo: string,
): Promise<void> {
  await prisma.order.updateMany({
    where: {
      productId,
      buyerEmail,
      estado: { in: ESTADOS_PRE_PAGO },
      metodoPago: { not: metodoNuevo },
    },
    data: { estado: "CANCELADO" },
  });
}
