import type { MetadataRoute } from "next";

// Genera /robots.txt. Next lo sirve como ruta estática, y middleware.ts ya tiene
// "/robots.txt" en la allowlist, así que es accesible aunque el candado de
// prelanzamiento (COMING_SOON) esté activo.
//
// Lo que se bloquea es lo que no aporta nada en un buscador y sí puede filtrar
// datos o gastar presupuesto de rastreo:
//   /admin             → panel interno
//   /api               → endpoints, nunca contenido indexable
//   /checkout          → flujo de pago, con estado por usuario
//   /perfil            → datos personales
//   /kyc               → verificación de identidad
//   /auth              → login y registro
//   /mensajes          → bandeja de chat privado entre comprador y vendedor
//   /product/*/editar  → formulario de edición, solo para el dueño de la publicación
//
// /mensajes y /product/*/editar (agregados en esta auditoría) quedaron afuera
// de la lista original: son "use client" protegidas solo con useSession en el
// navegador — middleware.ts únicamente aplica el candado de prelanzamiento, no
// autenticación por ruta — así que el HTML que recibe un rastreador es un 200
// público, aunque la UI redirija después de montarse en el navegador. Sin este
// disallow, Google podía rastrear e indexar ambas como contenido vacío/thin.
// El comodín "*" en /product/*/editar lo soportan Google, Bing, etc. (no es
// parte del estándar original de robots.txt, pero sí de su implementación
// real) y hace falta para no bloquear de paso /product/[id] (la ficha pública,
// que sí debe indexarse) con un prefijo más corto como "/product".
//
// /coming-soon NO se bloquea a propósito: es la página a la que se está llevando
// tráfico para la lista de espera. Sacarla del buscador iría en contra de la
// campaña de prelanzamiento.
//
// Fase 1 cumplida (2026-10-01): ya existen URLs de producto reales, así que
// app/sitemap.ts quedó creado y se declara aquí. Antes no se declaraba `sitemap`
// porque anunciar un /sitemap.xml que devuelve 404 es peor que no anunciar ninguno.
const SITE_URL = process.env.NEXT_PUBLIC_URL || process.env.NEXTAUTH_URL || "https://colbisnes.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api", "/checkout", "/perfil", "/kyc", "/auth", "/mensajes", "/product/*/editar"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
