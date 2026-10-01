import type { Metadata } from "next";
import ProductPageClient from "./ProductPageClient";
import { safeJsonLd } from "@/lib/jsonLd";

const SITE_URL = process.env.NEXT_PUBLIC_URL || process.env.NEXTAUTH_URL || "https://colbisnes.com";

const fmtCOP = (n: number) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");
const condicionLabel = (c?: string) =>
  c === "NUEVO" ? "Nuevo" : c === "REACONDICIONADO" ? "Reacondicionado" : "Usado";

// Mismo endpoint que usa el cliente (ProductPageClient → cargarProducto), a propósito:
// ahí ya vive toda la lógica de quién puede ver qué (ofertas privadas, IMEI
// enmascarado, un producto "ELIMINADO" devuelve 404 para cualquiera que no sea la
// cuenta master — ver app/api/products/[id]/route.ts). Duplicar esas reglas acá sería
// arriesgar que las dos copias se desincronicen con el tiempo.
//
// Esta llamada no reenvía cookies de sesión (es un fetch nuevo desde el servidor), así
// que siempre trae la vista pública — la misma que vería Google o alguien sin iniciar
// sesión. Es justo lo que hace falta para metadata y para el primer HTML. Next
// deduplica automáticamente fetches idénticos entre generateMetadata y la página
// dentro de la misma request, así que esto pega una sola vez a la red, no dos.
async function getProduct(id: string) {
  try {
    const res = await fetch(`${SITE_URL}/api/products/${id}`, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params;
  const product = await getProduct(id);

  if (!product) {
    // Publicación que no existe (o ELIMINADO): nada que ofrecerle a Google aquí.
    return { title: "Publicación no encontrada", robots: { index: false, follow: false } };
  }

  const titulo = `${product.title} — ${fmtCOP(product.priceCOP)} en ${product.city}`;
  const resumen = String(product.description || "").replace(/\s+/g, " ").trim().slice(0, 100);
  const descripcion = `${condicionLabel(product.condition)} · ${product.city} · ${fmtCOP(product.priceCOP)}. ${resumen}${resumen ? "…" : ""} Compra protegida en Colbisnes.`.slice(0, 160);
  const imagen = product.images?.[0]?.url || `${SITE_URL}/logo-google.png`;
  const url = `${SITE_URL}/product/${id}`;

  return {
    title: titulo, // el layout raíz le agrega "· Colbisnes" solo (title.template)
    description: descripcion,
    alternates: { canonical: url },
    openGraph: {
      title: `${titulo} · Colbisnes`,
      description: descripcion,
      url,
      type: "website",
      images: [{ url: imagen, alt: product.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${titulo} · Colbisnes`,
      description: descripcion,
      images: [imagen],
    },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await getProduct(id);

  // Datos estructurados por publicación (antes solo existía el Organization del sitio
  // completo, en app/layout.tsx). Esto es lo que le permite a Google mostrar precio y
  // disponibilidad directamente en el resultado de búsqueda.
  const productJsonLd = product && {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: String(product.description || "").slice(0, 500),
    image: (product.images ?? []).map((img: { url: string }) => img.url),
    sku: product.id,
    category: product.category,
    offers: {
      "@type": "Offer",
      price: product.priceCOP,
      priceCurrency: "COP",
      availability: product.status === "AVAILABLE" ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: `${SITE_URL}/product/${id}`,
    },
  };

  return (
    <>
      {productJsonLd && (
        <script
          type="application/ld+json"
          // safeJsonLd, no JSON.stringify a secas: title/description los escribe el
          // vendedor sin restricción de caracteres (ver app/api/products/route.ts), y
          // un "</script>" literal ahí rompería el tag — ver lib/jsonLd.ts.
          dangerouslySetInnerHTML={{ __html: safeJsonLd(productJsonLd) }}
        />
      )}
      <ProductPageClient productId={id} initialProduct={product} />
    </>
  );
}
