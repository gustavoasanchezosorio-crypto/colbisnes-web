import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CATEGORIES, THEME } from "@/lib/theme";
import { safeJsonLd } from "@/lib/jsonLd";
import CategoryProductCard from "@/components/CategoryProductCard";

const SITE_URL = process.env.NEXT_PUBLIC_URL || process.env.NEXTAUTH_URL || "https://colbisnes.com";

// Texto "bonito" (con tildes) para esta página, sin tocar lib/theme.ts: ahí `label` se
// guarda SIN tildes a propósito porque alimenta el <Select> de publicar y los chips de
// filtro del home (dos pantallas ya en producción, ver app/page.tsx) — cambiar esos
// strings para arreglar la ortografía de esta página nueva habría afectado a las otras
// dos sin necesidad. "Empleo" y "Servicios" no son "de segunda mano", así que tienen su
// propio título en vez de forzar la plantilla genérica de las demás categorías.
const COPY: Record<string, { nombre: string; titulo: string; descripcion: string }> = {
  Vehiculos: {
    nombre: "Vehículos",
    titulo: "Vehículos usados en Colombia",
    descripcion: "Carros, motos y otros vehículos usados publicados por particulares en toda Colombia.",
  },
  Inmuebles: {
    nombre: "Inmuebles",
    titulo: "Inmuebles en Colombia",
    descripcion: "Apartamentos, casas y lotes en venta o arriendo publicados por particulares en toda Colombia.",
  },
  Tecnologia: {
    nombre: "Tecnología",
    titulo: "Tecnología usada en Colombia",
    descripcion: "Celulares, computadores y accesorios usados o reacondicionados, con IMEI verificado.",
  },
  Hogar: {
    nombre: "Hogar y jardín",
    titulo: "Hogar y jardín de segunda mano en Colombia",
    descripcion: "Muebles, electrodomésticos y artículos para el hogar de segunda mano, a mejor precio que nuevos.",
  },
  Moda: {
    nombre: "Moda y accesorios",
    titulo: "Moda y accesorios de segunda mano en Colombia",
    descripcion: "Ropa, calzado y accesorios usados o nuevos publicados por particulares en toda Colombia.",
  },
  Mascotas: {
    nombre: "Mascotas",
    titulo: "Artículos para mascotas en Colombia",
    descripcion: "Accesorios y productos para mascotas publicados por particulares en toda Colombia.",
  },
  Ninos: {
    nombre: "Niños y bebés",
    titulo: "Niños y bebés: artículos de segunda mano en Colombia",
    descripcion: "Ropa, juguetes y artículos para bebés y niños de segunda mano, publicados por particulares.",
  },
  Deportes: {
    nombre: "Deportes",
    titulo: "Artículos deportivos de segunda mano en Colombia",
    descripcion: "Bicicletas, implementos y ropa deportiva usada o nueva a buen precio en toda Colombia.",
  },
  Empleo: {
    nombre: "Empleo",
    titulo: "Ofertas de empleo en Colombia",
    descripcion: "Ofertas de empleo publicadas por particulares y pequeños negocios en toda Colombia.",
  },
  Servicios: {
    nombre: "Servicios",
    titulo: "Servicios profesionales en Colombia",
    descripcion: "Servicios profesionales e independientes ofrecidos por particulares en toda Colombia.",
  },
  Otros: {
    nombre: "Otros",
    titulo: "Otros artículos de segunda mano en Colombia",
    descripcion: "Artículos variados publicados por particulares en toda Colombia.",
  },
};

// Mismo patrón que app/product/[id]/page.tsx: esta página le pega a su propio
// /api/products en vez de consultar Prisma directo, para heredar gratis las mismas
// reglas de visibilidad pública (IMEI enmascarado, excluir ELIMINADO, rating del
// vendedor ya calculado en un solo groupBy) sin duplicar esa lógica en un segundo
// lugar que se puede desincronizar con el tiempo. No se reenvían cookies de sesión a
// propósito: esta vista debe ser idéntica a lo que ve Google o alguien sin sesión.
async function getProductos(slug: string) {
  try {
    const res = await fetch(`${SITE_URL}/api/products?category=${encodeURIComponent(slug)}&limit=48`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

// Las 11 categorías son una lista cerrada y pequeña (lib/theme.ts): declararlas acá
// deja esas 11 rutas listas desde el build en vez de esperar a que alguien (o
// Google) las pida primero. El `cache:"no-store"` de getProductos de todas formas
// obliga a Next a resolver el listado en cada visita, así que esto no sirve HTML
// con productos congelados del momento del build — solo adelanta qué slugs existen.
export async function generateStaticParams() {
  return CATEGORIES.map((c) => ({ slug: c.id }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const categoria = CATEGORIES.find((c) => c.id === slug);

  if (!categoria) {
    // Slug fuera de las 11 categorías conocidas: no hay nada que ofrecerle a Google.
    return { title: "Categoría no encontrada", robots: { index: false, follow: false } };
  }

  const copy = COPY[slug];
  const descripcion = `${copy.descripcion} Compra protegida en Colbisnes.`.slice(0, 160);
  const url = `${SITE_URL}/categoria/${slug}`;

  return {
    title: copy.titulo, // el layout raíz le agrega "· Colbisnes" solo (title.template)
    description: descripcion,
    alternates: { canonical: url },
    openGraph: {
      title: `${copy.titulo} · Colbisnes`,
      description: descripcion,
      url,
      type: "website",
      images: [{ url: `${SITE_URL}/logo-google.png`, alt: "Colbisnes" }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${copy.titulo} · Colbisnes`,
      description: descripcion,
      images: [`${SITE_URL}/logo-google.png`],
    },
  };
}

export default async function CategoriaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const categoria = CATEGORIES.find((c) => c.id === slug);
  if (!categoria) notFound();

  const copy = COPY[slug];
  const productos = await getProductos(slug);

  // BreadcrumbList siempre va: existe independiente de si hay productos o no.
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: copy.nombre, item: `${SITE_URL}/categoria/${slug}` },
    ],
  };

  // ItemList solo referencia la URL de cada producto (no repite su Product JSON-LD
  // completo, que ya vive en app/product/[id]/page.tsx): es el patrón que recomienda
  // Google para páginas de listado, evitar native duplicar/confundir con dos schemas
  // distintos describiendo el mismo producto.
  const itemListJsonLd = productos.length > 0 && {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: copy.titulo,
    url: `${SITE_URL}/categoria/${slug}`,
    numberOfItems: productos.length,
    itemListElement: productos.map((p: any, i: number) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE_URL}/product/${p.id}`,
    })),
  };

  return (
    <>
      {/* safeJsonLd, no JSON.stringify a secas: copy.nombre/titulo son fijos, pero los
          títulos de producto en itemListJsonLd los escribe el vendedor sin restricción
          de caracteres — un "</script>" literal ahí rompería el tag (ver lib/jsonLd.ts). */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }} />
      {itemListJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(itemListJsonLd) }} />
      )}
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 20px 80px" }}>
        <nav aria-label="breadcrumb" style={{ fontSize: "0.85rem", marginBottom: 20 }}>
          <Link href="/" style={{ color: THEME.primary, textDecoration: "none" }}>Inicio</Link>
          <span style={{ color: THEME.muted, margin: "0 6px" }}>/</span>
          <span style={{ color: THEME.muted }}>{copy.nombre}</span>
        </nav>

        <h1 style={{ fontSize: "2rem", fontWeight: 800, color: THEME.text, margin: "0 0 10px", lineHeight: 1.2 }}>
          {categoria.icon} {copy.titulo}
        </h1>
        <p style={{ fontSize: "1.05rem", color: THEME.textSoft, maxWidth: 720, lineHeight: 1.6, margin: "0 0 32px" }}>
          {copy.descripcion} Todas las compras en Colbisnes están protegidas: el pago queda en custodia
          hasta que confirmes que recibiste tu producto.
        </p>

        {productos.length > 0 ? (
          // minmax envuelto en min(260px, 100%) y no suelto: un piso rígido de 260px se
          // sale por el costado en un teléfono angosto (mismo bug ya resuelto en el grid
          // del home, ver el comentario de InfiniteScroll en app/page.tsx).
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(260px, 100%), 1fr))", gap: 20 }}>
            {productos.map((p: any) => (
              <CategoryProductCard key={p.id} product={p} />
            ))}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "48px 20px", background: THEME.surfaceAlt, borderRadius: 20 }}>
            <p style={{ fontSize: "1.1rem", fontWeight: 700, color: THEME.text, margin: "0 0 8px" }}>
              Todavía no hay publicaciones en {copy.nombre}.
            </p>
            <p style={{ color: THEME.muted, margin: "0 0 20px" }}>
              Sé el primero en publicar en esta categoría — es gratis.
            </p>
            <Link
              href="/"
              style={{
                display: "inline-block",
                background: THEME.primary,
                color: "#fff",
                padding: "12px 24px",
                borderRadius: 12,
                textDecoration: "none",
                fontWeight: 700,
              }}
            >
              Publicar en Colbisnes
            </Link>
          </div>
        )}

        <nav aria-label="Otras categorías" style={{ marginTop: 44 }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 800, color: THEME.text, margin: "0 0 12px" }}>Otras categorías</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {CATEGORIES.filter((c) => c.id !== slug).map((c) => (
              <Link
                key={c.id}
                href={`/categoria/${c.id}`}
                style={{
                  fontSize: "0.85rem",
                  color: THEME.primary,
                  textDecoration: "none",
                  background: THEME.surfaceAlt,
                  padding: "8px 14px",
                  borderRadius: 20,
                  fontWeight: 600,
                }}
              >
                {c.icon} {c.label}
              </Link>
            ))}
          </div>
        </nav>
      </main>
    </>
  );
}
