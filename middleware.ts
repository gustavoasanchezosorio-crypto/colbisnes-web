import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { comingSoonActivo } from "@/lib/launch";

// Cookie que marca "este navegador tiene el link secreto" (bypass del candado).
const BYPASS_COOKIE = "cb_launch_bypass";

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
    return res;
  }

  // 2) ¿El candado está activo ahora mismo? Si no, todo pasa normal (caso 99% del tiempo).
  if (!comingSoonActivo(Date.now(), process.env.COMING_SOON)) {
    return NextResponse.next();
  }

  // 3) Rutas de infraestructura: siempre pasan (pagos, KYC, login, assets).
  if (estaEnAllowlist(pathname)) {
    return NextResponse.next();
  }

  // 4) ¿Este navegador ya tiene la cookie del link secreto?
  if (request.cookies.get(BYPASS_COOKIE)?.value === "1") {
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
