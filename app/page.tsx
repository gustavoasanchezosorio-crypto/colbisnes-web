import type { Metadata } from "next";
import HomeClient from "./HomeClient";

const SITE_URL = process.env.NEXT_PUBLIC_URL || process.env.NEXTAUTH_URL || "https://colbisnes.com";

// Antes este archivo ERA toda la home ("use client", con el formulario de publicar,
// filtros, scroll infinito, sesión, etc. — ver app/HomeClient.tsx, que es exactamente
// ese código sin tocar, solo movido). Se separó en dos durante la auditoría SEO
// 2026-10-01 al descubrir, revisando el HTML crudo con curl, que la home se servía
// como HTML estático horneado en el build: la tabla de rutas de `next build` la
// marcaba "○ /" (estática) en vez de "ƒ /" (dinámica). Como el contenido real
// depende de useSearchParams (un hook de cliente, para los filtros por URL),
// Next.js no podía resolverlo en build-time y horneaba para siempre el fallback de
// Suspense ("Cargando...", sin h1 ni nada) — eso es lo que recibía cualquier
// visitante o Googlebot, siempre, hasta el siguiente deploy. Por eso "comprar cosas
// de segunda mano" no mostraba a Colbisnes: el h1 con esas palabras ya existía en
// el código, pero nunca llegaba al HTML que lee un crawler.
//
// Este archivo ahora es un Server Component (sin "use client"), lo que permite dos
// cosas que un "use client" no puede hacer:
export const dynamic = "force-dynamic"; // cada visita renderiza de nuevo en el servidor — nada de HTML viejo horneado en el build.

const TITULO = "Compra y vende de segunda mano en Colombia";
const DESCRIPCION =
  "Marketplace colombiano de segunda mano con pagos protegidos: publica gratis, recibe ofertas y cobra seguro — Colbisnes retiene el pago hasta que todo llegue bien.";

export const metadata: Metadata = {
  // Título completo y explícito ("· Colbisnes" a mano), NO por el title.template
  // que hereda de app/layout.tsx: se probó en local con curl sobre el HTML crudo
  // y el template no se aplicó para esta ruta raíz (salió solo TITULO, sin el
  // sufijo) — a diferencia de categoría/producto, donde sí se confirmó en vivo.
  // openGraph/twitter TAMPOCO heredan nunca ese template (así es Next.js), por
  // eso categoría/producto ya escriben esos dos a mano; aquí se hace lo mismo
  // también para el title normal, por consistencia y porque es lo que de verdad
  // se comprobó que funciona.
  title: `${TITULO} · Colbisnes`,
  description: DESCRIPCION,
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: `${TITULO} · Colbisnes`,
    description: DESCRIPCION,
    url: SITE_URL,
    type: "website",
    // Mismas imágenes y medidas que app/layout.tsx — no inventar otras. Ahí está
    // documentado por qué el ancho del contenido tiene que ser ≤ al alto del
    // canvas, para que WhatsApp no le recorte el eslogan al reenviar la tarjeta.
    images: [
      { url: "/logo-google.png", width: 3595, height: 1882, alt: "Colbisnes" },
      { url: "/logo-og-square.png", width: 1080, height: 1080, alt: "Colbisnes" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${TITULO} · Colbisnes`,
    description: DESCRIPCION,
    images: ["/logo-google.png"],
  },
};

export default function Page() {
  return <HomeClient />;
}
