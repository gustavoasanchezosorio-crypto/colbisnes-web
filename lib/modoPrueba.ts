// lib/modoPrueba.ts
//
// MODO PRUEBA PARA PROBADORES — creado el 2026-07-30.
//
// El problema que resuelve
// -----------------------
// El link secreto `?acceso=CÓDIGO` (ver middleware.ts) abre el candado de
// prelanzamiento, pero hasta hoy lo abría de par en par: el probador entraba a
// PRODUCCIÓN con el checkout real de Wompi, la liberación de escrow real y la
// billetera caliente activa. Es decir, un "probador" podía mover plata de verdad
// sin querer. Este archivo convierte ese mismo bypass en un modo acotado: se
// puede navegar, publicar, ofertar y chatear, pero NO se puede mover dinero.
//
// Qué NO es
// ---------
// No confundir con el `TEST_MODE` de lib/pricing.ts (`NEXT_PUBLIC_TEST_MODE`).
// Aquel es GLOBAL (afecta a todos los usuarios a la vez), y no es un modo
// seguro: solo baja el cobro a $1.500 — sigue siendo un cobro real, con Wompi
// real. Este de aquí es POR NAVEGADOR y bloquea la salida de dinero.
//
// Se apaga solo
// -------------
// El modo prueba vive atado a la ventana de prelanzamiento: `comingSoonActivo()`.
// El día que se apague COMING_SOON —o simplemente cuando pase la hora de
// lanzamiento— `enModoPrueba()` empieza a devolver false para todo el mundo, sin
// tocar código ni variables. No hay que acordarse de desactivar nada.
//
// Dos cookies, y por qué
// ----------------------
//   · cb_launch_bypass  (httpOnly)  → la de verdad. Es la que abre el candado y
//     la ÚNICA que este archivo mira para decidir si hay que bloquear dinero.
//     Al ser httpOnly, el navegador no la puede leer desde JavaScript.
//   · cb_modo_prueba    (NO httpOnly) → solo sirve para que el banner amarillo
//     sepa que debe pintarse. No otorga ningún permiso ni activa nada. Si
//     alguien se la inventa a mano, lo único que consigue es ver un banner.
//
// Dónde se aplica
// ---------------
// El matcher del middleware EXCLUYE `/api` a propósito (ahí viven los webhooks
// de Wompi y Didit). Por eso el bloqueo NO puede vivir en el middleware: tiene
// que comprobarse dentro de cada ruta de API que mueva plata.

// Este módulo se mantiene DELIBERADAMENTE sin importar `next/server` ni nada de
// React: lo cargan el middleware (runtime edge), las rutas de API (Node) y —solo
// por las constantes de texto— componentes de cliente. Cualquier import de
// framework aquí rompería alguno de los tres.
import { comingSoonActivo } from "@/lib/launch";

/** Cookie httpOnly que abre el candado de prelanzamiento. La fija middleware.ts. */
export const COOKIE_BYPASS = "cb_launch_bypass";

/** Cookie visible desde el navegador. Solo para pintar el banner. Cero permisos. */
export const COOKIE_MODO_PRUEBA_UI = "cb_modo_prueba";

/**
 * Texto exacto del banner. Se comparte para que UI y servidor no se
 * desincronicen.
 *
 * POR QUÉ NO DICE YA "LAS TRANSACCIONES NO SON REALES" (cambiado el 2026-08-02)
 * ---------------------------------------------------------------------------
 * Ese texto nació cuando por aquí solo pasaban probadores de confianza, y para
 * ellos era exacto. Desde hoy el enlace de acceso viaja también en el correo de
 * bienvenida de la lista de espera, así que quien lee esta franja ya no es un
 * probador: es un vendedor real al que le estamos pidiendo que publique cosas
 * suyas de verdad antes del 12 de agosto.
 *
 * A esa persona, leer "las transacciones no son reales" justo antes de subir
 * las fotos de su bicicleta le dice —con razón— que su publicación es de
 * mentiras y que se va a borrar. Es decir, el aviso saboteaba justo lo que
 * queríamos conseguir. Lo que NO es real todavía es el pago, y eso se explica
 * en MENSAJE_PAGO_BLOQUEADO, en el momento en que alguien intenta pagar.
 *
 * OJO CON LA LONGITUD: la franja mide 34 px de alto y es de altura fija
 * (components/BannerModoPrueba.tsx). Si el texto no cabe en una línea en un
 * móvil estrecho, envuelve y se corta. El texto anterior tenía 44 caracteres;
 * no pasarse de ahí.
 */
export const BANNER_MODO_PRUEBA = "ACCESO ANTICIPADO · Ya puedes publicar";

/**
 * Mensaje del checkout cuando el pago real queda deshabilitado.
 *
 * Se ve cuando alguien con acceso anticipado intenta pagar. Dice la fecha
 * exacta a propósito: "no disponible" suena a avería, y esto no está roto —
 * todavía no ha llegado.
 */
export const MENSAJE_PAGO_BLOQUEADO =
  "Las compras se activan el miércoles 12 de agosto a las 10:20 a.m. Hasta entonces puedes publicar, mirar y preparar tus productos.";

/**
 * ¿Sigue viva la ventana de prelanzamiento?
 *
 * Es la misma condición que decide si se muestra la pantalla "Próximamente", así
 * que el modo prueba nace y muere junto con el candado.
 */
export function prelanzamientoActivo(nowMs: number = Date.now()): boolean {
  return comingSoonActivo(nowMs, process.env.COMING_SOON);
}

/**
 * Lee una cookie de una cabecera `Cookie` cruda.
 *
 * Se hace a mano en vez de usar la librería `cookie` porque este módulo lo
 * importa el middleware, que corre en el runtime edge, y porque aquí solo hay
 * que leer un valor conocido ("1"). Nunca lanza: una cabecera malformada
 * simplemente devuelve null.
 */
function leerCookie(cabecera: string | null | undefined, nombre: string): string | null {
  if (!cabecera) return null;
  for (const trozo of cabecera.split(";")) {
    const igual = trozo.indexOf("=");
    if (igual === -1) continue;
    if (trozo.slice(0, igual).trim() !== nombre) continue;
    try {
      return decodeURIComponent(trozo.slice(igual + 1).trim());
    } catch {
      return trozo.slice(igual + 1).trim();
    }
  }
  return null;
}

/**
 * ¿Esta petición viene de un probador con el link secreto?
 *
 * Acepta cualquier cosa con `headers` (Request, NextRequest), porque las rutas
 * del proyecto no son uniformes: unas reciben `Request` pelado y otras
 * `NextRequest`.
 *
 * Devuelve false si la ventana de prelanzamiento ya cerró, aunque el navegador
 * todavía cargue la cookie: al abrir la web al público el bypass deja de tener
 * sentido y el modo prueba desaparece solo.
 */
export function enModoPrueba(req: { headers: Headers }): boolean {
  if (!prelanzamientoActivo()) return false;
  return leerCookie(req.headers.get("cookie"), COOKIE_BYPASS) === "1";
}

/**
 * Respuesta 403 estándar del modo prueba.
 *
 * `modoPrueba: true` va en el cuerpo para que el frontend pueda distinguir este
 * caso de un 403 de permisos de verdad y mostrar el mensaje correcto.
 *
 * Devuelve un `Response` del estándar web (no `NextResponse`) para no tener que
 * importar `next/server` — ver la nota de arriba. Las rutas de API pueden
 * devolverlo tal cual: NextResponse no es más que un Response con extras.
 */
export function bloqueadoPorModoPrueba(mensaje: string): Response {
  return new Response(JSON.stringify({ error: mensaje, modoPrueba: true }), {
    status: 403,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Igual que la anterior, pero para las rutas a las que el navegador llega
 * NAVEGANDO (los checkout de Wompi son redirecciones GET, no fetch).
 *
 * Si a esas se les devuelve JSON, el probador se queda mirando `{"error":...}`
 * en crudo y parece que la web se rompió. Esto le devuelve una página legible
 * con el motivo y un enlace para volver.
 */
export function bloqueadoPorModoPruebaHtml(mensaje: string): Response {
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Acceso anticipado · Colbisnes</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display',Segoe UI,sans-serif;padding:24px">
  <div style="max-width:420px;background:#fff;border:1px solid #fed7aa;border-radius:20px;padding:28px 26px;text-align:center;box-shadow:0 12px 40px rgba(0,0,0,.07)">
    <div style="font-size:34px;line-height:1">⚠️</div>
    <h1 style="margin:12px 0 8px;font-size:18px;color:#9a3412">${escaparHtml(BANNER_MODO_PRUEBA)}</h1>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#7c2d12">${escaparHtml(mensaje)}</p>
    <a href="/" style="display:inline-block;padding:12px 22px;border-radius:14px;background:#1F6BFF;color:#fff;font-weight:800;font-size:14px;text-decoration:none">Volver a Colbisnes</a>
  </div>
</body></html>`;
  return new Response(html, {
    status: 403,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
