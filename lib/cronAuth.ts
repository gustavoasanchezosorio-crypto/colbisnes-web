import crypto from "crypto";

/**
 * Verifica el header Authorization de un endpoint de cron contra CRON_SECRET usando una
 * comparación de tiempo constante (crypto.timingSafeEqual), para no filtrar el secreto vía
 * ataques de temporización byte-a-byte como sí lo haría `===`. Fail-closed: si CRON_SECRET
 * no está configurado, siempre rechaza.
 *
 * Acepta cualquier Request (NextRequest extiende Request), así se reutiliza en todas las
 * rutas /api/cron/* con la misma lógica en un solo lugar.
 */
export function verificarCronSecret(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  const recibido = req.headers.get("authorization") || "";
  const esperado = `Bearer ${cronSecret}`;

  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  // timingSafeEqual exige buffers de igual longitud; si difieren, no es válido. El guard de
  // longitud es estándar: la longitud del header no es secreta y no filtra el valor del token.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
