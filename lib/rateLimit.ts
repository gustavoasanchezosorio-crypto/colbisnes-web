/**
 * Limitador de peticiones en memoria, con ventana deslizante.
 *
 * ---------------------------------------------------------------------------
 * LIMITACIONES CONOCIDAS — revisado el 2026-07-30
 *
 * (El comentario anterior decía "per serverless instance". Quedó obsoleto: la
 * app ya no es serverless, corre como servidor persistente en Railway.)
 *
 * El estado vive en un Map dentro de la memoria del proceso. Eso implica dos
 * cosas que hay que tener presentes antes de crecer:
 *
 *  1. SE PIERDE AL REINICIAR. Cada despliegue, cada reinicio y cada caída
 *     vacían todos los contadores. En la práctica, alguien a quien estemos
 *     frenando por intentos fallidos de login queda libre en el momento en que
 *     publicamos una versión nueva. Hoy es asumible porque desplegamos poco,
 *     pero es un agujero real, no teórico.
 *
 *  2. NO SIRVE CON MÁS DE UNA INSTANCIA. Con N réplicas, cada una lleva su
 *     propia cuenta y el límite efectivo pasa a ser N veces el configurado.
 *     Hoy no nos afecta porque numReplicas está en 1 —y debe seguir así, pero
 *     por otro motivo: los dos cron de node-cron viven dentro de server.js y
 *     con dos réplicas se ejecutarían dos veces, incluida la liberación de
 *     escrow—. Es decir: hay DOS cosas distintas atando esta app a una sola
 *     instancia, y ambas hay que resolverlas antes de escalar en horizontal.
 *
 * MIGRACIÓN RECOMENDADA: mover el contador a Redis (Upstash o el add-on de
 * Railway) con el patrón INCR + EXPIRE, que además sobrevive a los reinicios.
 * A 2026-07-30 NO hay Redis aprovisionado —no existe REDIS_URL en las variables
 * del proyecto—, así que esta migración queda pendiente y no se hace a ciegas.
 * ---------------------------------------------------------------------------
 */

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitRecord>();

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of store.entries()) {
    if (record.resetAt < now) store.delete(key);
  }
}, 5 * 60 * 1000);

export interface RateLimitOptions {
  /** Max requests allowed in the window */
  limit: number;
  /** Window duration in seconds */
  windowSeconds: number;
}

export function rateLimit(
  identifier: string,
  options: RateLimitOptions
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const windowMs = options.windowSeconds * 1000;
  const key = `rl:${identifier}`;

  const record = store.get(key);

  if (!record || record.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: options.limit - 1, resetAt: now + windowMs };
  }

  record.count += 1;

  if (record.count > options.limit) {
    return { allowed: false, remaining: 0, resetAt: record.resetAt };
  }

  return { allowed: true, remaining: options.limit - record.count, resetAt: record.resetAt };
}

/** Extract the real IP from Next.js request headers */
export function getIP(request: Request): string {
  const forwarded = (request.headers as any).get?.("x-forwarded-for") ||
    (request.headers as Headers).get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}
