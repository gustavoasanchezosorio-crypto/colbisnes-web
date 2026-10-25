import type { Metadata } from "next";
import UserProfileClient from "./UserProfileClient";
import { safeJsonLd } from "@/lib/jsonLd";

const SITE_URL = process.env.NEXT_PUBLIC_URL || process.env.NEXTAUTH_URL || "https://colbisnes.com";

// Mismo patrón que app/product/[id]/page.tsx y app/categoria/[slug]/page.tsx: esta
// llamada no reenvía cookies de sesión (fetch nuevo desde el servidor), así que
// siempre trae la vista pública — la misma que vería Google o alguien sin sesión.
// /api/users/[id] ya decide ahí mismo qué campos son públicos (email/teléfono/
// Nequi/Bre-B solo si isOwner, ver app/api/users/[id]/route.ts) — no se duplica esa
// regla acá. Next deduplica fetches idénticos entre generateMetadata y la página
// dentro de la misma request, así que esto pega una sola vez a la red.
async function getUser(id: string) {
  try {
    const res = await fetch(`${SITE_URL}/api/users/${id}`, { cache: "no-store" });
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
  const user = await getUser(id);

  if (!user) {
    return { title: "Perfil no encontrado", robots: { index: false, follow: false } };
  }

  const nombre = user.name || "Vendedor";
  const titulo = `${nombre} — perfil de vendedor en Colbisnes`;
  const partes = [
    user.city ? `Vendedor en ${user.city}` : "Vendedor en Colbisnes",
    user.totalReviews > 0 ? `${user.avgRating.toFixed(1)}★ (${user.totalReviews} reseñas)` : "Nuevo en Colbisnes",
    `${(user.products?.length ?? 0)} publicaciones activas`,
  ];
  const descripcion = `${partes.join(" · ")}. Compra protegida: el pago queda en custodia hasta que confirmes que todo llegó bien.`.slice(0, 160);
  const url = `${SITE_URL}/user/${id}`;
  const imagen = user.image || `${SITE_URL}/logo-google.png`;

  return {
    title: titulo, // el layout raíz le agrega "· Colbisnes" solo (title.template)
    description: descripcion,
    alternates: { canonical: url },
    openGraph: {
      title: `${titulo} · Colbisnes`,
      description: descripcion,
      url,
      type: "profile",
      images: [{ url: imagen, alt: nombre }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${titulo} · Colbisnes`,
      description: descripcion,
      images: [imagen],
    },
  };
}

export default async function UserProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser(id);

  // ProfilePage + Person, el par que recomienda Google para páginas de perfil de
  // usuario (distinto del Product de app/product/[id]/page.tsx y del Organization
  // de app/layout.tsx — cada tipo de página declara el schema que le corresponde,
  // no uno genérico reutilizado). aggregateRating solo se declara si ya tiene
  // reseñas: Google penaliza un aggregateRating con ratingCount en cero.
  const profileJsonLd = user && {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    mainEntity: {
      "@type": "Person",
      name: user.name || "Vendedor",
      image: user.image || undefined,
      ...(user.totalReviews > 0 && {
        aggregateRating: {
          "@type": "AggregateRating",
          ratingValue: user.avgRating,
          reviewCount: user.totalReviews,
        },
      }),
    },
  };

  return (
    <>
      {profileJsonLd && (
        <script
          type="application/ld+json"
          // safeJsonLd, no JSON.stringify a secas: user.name lo escribe el usuario sin
          // restricción de caracteres — un "</script>" literal ahí rompería el tag
          // (mismo motivo que en product/page.tsx y categoria/[slug]/page.tsx, ver lib/jsonLd.ts).
          dangerouslySetInnerHTML={{ __html: safeJsonLd(profileJsonLd) }}
        />
      )}
      <UserProfileClient userId={id} initialUser={user} />
    </>
  );
}
