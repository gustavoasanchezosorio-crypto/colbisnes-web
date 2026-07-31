import type { MetadataRoute } from "next";

// Genera /robots.txt. Next lo sirve como ruta estática, y middleware.ts ya tiene
// "/robots.txt" en la allowlist, así que es accesible aunque el candado de
// prelanzamiento (COMING_SOON) esté activo.
//
// Lo que se bloquea es lo que no aporta nada en un buscador y sí puede filtrar
// datos o gastar presupuesto de rastreo:
//   /admin    → panel interno
//   /api      → endpoints, nunca contenido indexable
//   /checkout → flujo de pago, con estado por usuario
//   /perfil   → datos personales
//   /kyc      → verificación de identidad
//   /auth     → login y registro
//
// /coming-soon NO se bloquea a propósito: es la página a la que se está llevando
// tráfico para la lista de espera. Sacarla del buscador iría en contra de la
// campaña de prelanzamiento.
//
// Todavía no se declara `sitemap`: no existe /sitemap.xml y anunciar uno que
// devuelve 404 es peor que no anunciar ninguno. Se añade en la fase 1, cuando
// haya URLs de producto reales que listar.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api", "/checkout", "/perfil", "/kyc", "/auth"],
    },
  };
}
