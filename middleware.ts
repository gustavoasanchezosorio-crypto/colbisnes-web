import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { comingSoonActivo } from "@/lib/launch";
import { COOKIE_BYPASS, COOKIE_MODO_PRUEBA_UI } from "@/lib/modoPrueba";

// Cookie que marca "este navegador tiene el link secreto" (bypass del candado).
const BYPASS_COOKIE = COOKIE_BYPASS;

// Palabra que se pasa en ?acceso= para SALIR del modo prueba y borrar el bypass.
//
// Existe por un motivo muy concreto: el admin. Si el admin alguna vez abre el
// link secreto, su navegador se queda con la cookie de bypass — y a partir de
// ahí las rutas de desembolso (/api/admin/liberar-pago y liberar-pago-auto) lo
// van a rechazar con 403, porque no distinguen "admin" de "probador": ven la
// cookie y bloquean. Es el comportamiento correcto (más vale bloquear de más en
// un camino de dinero), pero hace falta una salida evidente.
//
// Uso: https://colbisnes.com/?acceso=salir
const CODIGO_SALIDA = "salir";

// Borra una cookie de forma explícita. Se usa maxAge:0 en vez de cookies.delete()
// para fijar el mismo `path` con el que se creó; si no coinciden, el navegador se
// queda con la cookie vieja y el probador nunca sale del modo prueba.
function borrarCookie(res: NextResponse, nombre: string) {
  res.cookies.set(nombre, "", { path: "/", maxAge: 0 });
}

// Marca visible del modo prueba. NO es httpOnly a propósito: el banner amarillo
// es un componente de cliente y necesita poder leerla desde document.cookie.
// No otorga ningún permiso — la que abre el candado y activa los bloqueos de
// dinero en el servidor sigue siendo la httpOnly de arriba.
function ponerMarcaModoPrueba(res: NextResponse, request: NextRequest) {
  res.cookies.set(COOKIE_MODO_PRUEBA_UI, "1", {
    httpOnly: false,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 días, igual que el bypass
  });
}

// Rutas que NUNCA se bloquean: la maquinaria de fondo debe seguir viva aunque el
// candado esté activo. Esto es CRÍTICO — aquí viven los webhooks de Wompi (pagos) y
// Didit (KYC), el login, el chat en tiempo real y los archivos estáticos.
function estaEnAllowlist(pathname: string): boolean {
  if (
    pathname.startsWith("/api") ||          // TODO el backend: webhooks Wompi/Didit, auth, etc.
    pathname.startsWith("/_next") ||        // chunks y assets de Next
    pathname.startsWith("/socket.io") ||    // chat/notificaciones en tiempo real
    pathname.startsWith("/coming-soon") ||  // la propia pantalla del reloj (evita bucle)
    pathname.startsWith("/auth/login") ||   // para que el admin pueda iniciar sesión
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml"
  ) {
    return true;
  }
  // Cualquier archivo con extensión (.svg, .png, .css, .js, .webmanifest, etc.).
  if (/\.[a-zA-Z0-9]+$/.test(pathname)) return true;
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // 1) Link secreto: ?acceso=CÓDIGO → guarda cookie de bypass y limpia la URL.
  //    Entrar por aquí es, además, entrar en MODO PRUEBA (ver lib/modoPrueba.ts):
  //    se puede navegar, publicar, ofertar y chatear, pero no mover dinero.
  const codigo = process.env.LAUNCH_BYPASS_CODE;
  const acceso = searchParams.get("acceso");
  if (codigo && acceso && acceso === codigo) {
    const url = request.nextUrl.clone();
    url.searchParams.delete("acceso");
    const res = NextResponse.redirect(url);
    res.cookies.set(BYPASS_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 días
    });
    ponerMarcaModoPrueba(res, request);
    return res;
  }

  // 1.b) Salida explícita: ?acceso=salir → borra el bypass y la marca del modo
  //      prueba. Es la vía para que el admin recupere el acceso a las rutas de
  //      desembolso si alguna vez usó el link de probador (ver CODIGO_SALIDA).
  if (acceso === CODIGO_SALIDA) {
    const url = request.nextUrl.clone();
    url.searchParams.delete("acceso");
    const res = NextResponse.redirect(url);
    borrarCookie(res, BYPASS_COOKIE);
    borrarCookie(res, COOKIE_MODO_PRUEBA_UI);
    return res;
  }

  const tieneBypass = request.cookies.get(BYPASS_COOKIE)?.value === "1";
  const tieneMarcaUI = request.cookies.get(COOKIE_MODO_PRUEBA_UI)?.value === "1";

  // 2) ¿El candado está activo ahora mismo? Si no, todo pasa normal (caso 99% del tiempo).
  if (!comingSoonActivo(Date.now(), process.env.COMING_SOON)) {
    // La web ya está abierta al público: el modo prueba dejó de existir (el
    // servidor tampoco lo aplica, ver enModoPrueba()). Si algún navegador se
    // quedó con la marca, se limpia aquí para que no siga viendo el banner
    // amarillo. Esto es lo que hace que el modo prueba desaparezca SOLO el día
    // del lanzamiento, sin tocar código.
    if (!tieneMarcaUI) return NextResponse.next();
    const res = NextResponse.next();
    borrarCookie(res, COOKIE_MODO_PRUEBA_UI);
    return res;
  }

  // 2.b) Candado activo y bypass presente, pero sin la marca visible: es un
  //      probador que ya tenía la cookie de antes de que existiera el modo
  //      prueba. Se le pone la marca para que vea el banner. Va antes del
  //      allowlist para que funcione también entrando por /auth/login.
  if (tieneBypass && !tieneMarcaUI) {
    const res = NextResponse.next();
    ponerMarcaModoPrueba(res, request);
    return res;
  }

  // 3) Rutas de infraestructura: siempre pasan (pagos, KYC, login, assets).
  if (estaEnAllowlist(pathname)) {
    return NextResponse.next();
  }

  // 4) ¿Este navegador ya tiene la cookie del link secreto?
  if (tieneBypass) {
    return NextResponse.next();
  }

  // 5) ¿Es el admin logueado? (getToken solo DESCIFRA la cookie JWT, no toca la BD;
  //    es compatible con el runtime edge del middleware). La comparación de correo
  //    replica la función esAdmin() del resto de la app.
  try {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
    const email = (token?.email as string | undefined)?.toLowerCase();
    if (adminEmail && email && email === adminEmail) {
      return NextResponse.next();
    }
  } catch {
    // Si algo falla leyendo el token, tratamos al visitante como público.
  }

  // 6) Visitante público → a la pantalla "Próximamente" con el reloj.
  const url = request.nextUrl.clone();
  url.pathname = "/coming-soon";
  url.search = "";
  return NextResponse.redirect(url);
}

// El middleware corre en todas las rutas MENOS las excluidas aquí (que además están
// cubiertas por el allowlist como doble seguro).
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
