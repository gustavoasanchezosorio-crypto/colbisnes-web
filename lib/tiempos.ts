// lib/tiempos.ts

export const PAYMENT_WINDOW_MINUTES = 10;

/**
 * Devuelve Date real para Prisma DateTime.
 * Ventana de pago: 10 minutos desde "now".
 */
export function computePaymentExpiresAt(now: Date = new Date()): Date {
  return new Date(now.getTime() + PAYMENT_WINDOW_MINUTES * 60 * 1000);
}
