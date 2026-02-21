// lib/tiempos.ts
export const PAYMENT_TIMEOUT_MINUTES = (() => {
  const raw = process.env.PAYMENT_TIMEOUT_MINUTES ?? "10";
  const n = Number(raw);

  // seguridad: entre 1 y 60
  const minutes = Number.isFinite(n) ? Math.min(Math.max(n, 1), 60) : 10;

  return minutes;
})();

export const PAYMENT_TIMEOUT_MS = PAYMENT_TIMEOUT_MINUTES * 60 * 1000;

export function computePaymentExpiresAt(nowMs: number = Date.now()) {
  // Guardamos como timestamp en ms (number) porque tu DB lo está manejando así.
  return nowMs + PAYMENT_TIMEOUT_MS;
}