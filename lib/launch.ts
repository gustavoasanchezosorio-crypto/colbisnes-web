// Configuración del lanzamiento y del candado "Próximamente".
//
// Objetivo: la app se abre SOLA el 12 de agosto de 2026 a las 10:20 a.m. hora de
// Colombia (día y hora de nacimiento del fundador). Antes de esa fecha, y desde el
// 1 de agosto, los visitantes del público ven una pantalla con un reloj regresivo.
// El admin logueado y quien tenga el link secreto entran normal.

export const LAUNCH_AT_ISO = "2026-08-12T10:20:00-05:00";
export const LAUNCH_AT_MS = Date.parse(LAUNCH_AT_ISO);

// Desde esta fecha empieza a mostrarse el candado (lanzamiento a internet).
export const LAUNCH_WINDOW_START_ISO = "2026-08-01T00:00:00-05:00";
export const LAUNCH_WINDOW_START_MS = Date.parse(LAUNCH_WINDOW_START_ISO);

/**
 * Decide si el candado "Próximamente" debe estar activo en este instante.
 *
 * @param nowMs  instante actual en milisegundos (Date.now())
 * @param flag   valor de process.env.COMING_SOON: "on" | "off" | "auto" | undefined
 *
 * Reglas (en orden de prioridad):
 *  1. "off" / "false" / "0"      → nunca bloquear (interruptor manual apagado).
 *  2. ya pasó la hora de launch  → nunca bloquear (la app quedó abierta para siempre).
 *  3. "on" / "true" / "1"        → bloquear (interruptor manual forzado).
 *  4. "auto" / undefined / resto → bloquear solo dentro de la ventana [inicio, launch).
 */
export function comingSoonActivo(nowMs: number, flag?: string | null): boolean {
  const f = (flag || "").trim().toLowerCase();

  // 1) Apagado manual: gana sobre todo lo demás.
  if (f === "off" || f === "false" || f === "0") return false;

  // 2) Si ya llegó la hora del lanzamiento, la app queda abierta pase lo que pase.
  if (Number.isFinite(LAUNCH_AT_MS) && nowMs >= LAUNCH_AT_MS) return false;

  // 3) Encendido manual.
  if (f === "on" || f === "true" || f === "1") return true;

  // 4) Automático: bloquear solo desde el inicio de la ventana en adelante.
  if (!Number.isFinite(LAUNCH_WINDOW_START_MS)) return false;
  return nowMs >= LAUNCH_WINDOW_START_MS;
}
