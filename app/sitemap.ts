import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { CATEGORIES } from "@/lib/theme";

const SITE_URL = process.env.NEXT_PUBLIC_URL || process.env.NEXTAUTH_URL || "https://colbisnes.com";

// Reemplaza el "todavía no" de app/robots.ts: ya hay publicaciones reales que listar.
// middleware.ts ya tiene "/sitemap.xml" en la allowlist (quedó puesto anticipando
// justo esto), así que es accesible aunque el candado de prelanzamiento estuviera
// activo — hoy ya no lo está (ver lib/launch.ts).
//
// Solo se listan campos públicos (id, fecha) directo de Prisma, sin pasar por
// /api/products/[id]: el sitemap no necesita ofertas ni nada sensible, así que
// consultar la tabla acá es más liviano y no implica ningún riesgo de privacidad.
//
// Se excluye "ELIMINADO" (soft-delete, ver DELETE en app/api/products/[id]/route.ts):
// esa ruta ya le devuelve 404 a cualquiera que no sea la cuenta master, así que
// anunciar esa URL en el sitemap sería mandar a Google a una página que para él no
// existe. Todo lo demás (disponible, vendido, en proceso) se deja: una ficha vendida
// sigue siendo contenido real y puede seguir recibiendo visitas.
export const revalidate = 3600; // 1 hora: los productos cambian seguido, no hace falta recalcular en cada request

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const productos = await prisma.product.findMany({
    where: { status: { not: "ELIMINADO" } },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const paginasProducto: MetadataRoute.Sitemap = productos.map((p) => ({
    url: `${SITE_URL}/product/${p.id}`,
    lastModified: p.createdAt,
    changeFrequency: "daily",
    priority: 0.8,
  }));

  // Las 11 categorías (app/categoria/[slug]/page.tsx) son páginas fijas, no filas de la
  // tabla Product, así que no salen del query de arriba. lastModified va con la fecha
  // de esta misma ejecución (no hay una fecha "real" que les corresponda, a diferencia
  // de un producto con su createdAt) — igual que el home, abajo. Prioridad 0.6: por
  // debajo de los productos (0.8), porque son páginas de entrada/agregación y el
  // contenido que de verdad importa indexar es la ficha de cada producto.
  const paginasCategoria: MetadataRoute.Sitemap = CATEGORIES.map((c) => ({
    url: `${SITE_URL}/categoria/${c.id}`,
    lastModified: new Date(),
    changeFrequency: "daily",
    priority: 0.6,
  }));

  return [
    { url: SITE_URL, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    ...paginasCategoria,
    ...paginasProducto,
  ];
}
