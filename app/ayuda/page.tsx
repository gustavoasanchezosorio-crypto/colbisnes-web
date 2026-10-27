import type { Metadata } from "next";
import Link from "next/link";
import { THEME } from "@/lib/theme";
import { safeJsonLd } from "@/lib/jsonLd";
import { BLU_INTENTS, urlWhatsappSoporte } from "@/lib/bluFaq";

const SITE_URL = process.env.NEXT_PUBLIC_URL || process.env.NEXTAUTH_URL || "https://colbisnes.com";

const TITULO = "Centro de ayuda";
const DESCRIPCION =
  "Resuelve tus dudas sobre contra entrega, comisión de reserva, verificación de identidad, envíos y más en Colbisnes.";

export const metadata: Metadata = {
  title: TITULO,
  description: DESCRIPCION,
  alternates: { canonical: `${SITE_URL}/ayuda` },
  openGraph: {
    title: `${TITULO} · Colbisnes`,
    description: DESCRIPCION,
    url: `${SITE_URL}/ayuda`,
    type: "website",
    images: [{ url: `${SITE_URL}/logo-google.png`, alt: "Colbisnes" }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${TITULO} · Colbisnes`,
    description: DESCRIPCION,
    images: [`${SITE_URL}/logo-google.png`],
  },
};

// Convierte el *bold* y los \n de las respuestas de Nolan (lib/bluFaq.ts, pensadas
// para un bocadillo de chat) en texto plano legible para una página web y para el
// JSON-LD de FAQPage: Google no necesita (ni quiere) los asteriscos de markdown en
// la propiedad `text`, y dejarlos ahí se vería como un error de formato en el
// resultado enriquecido.
function textoPlano(respuesta: string): string {
  return respuesta.replace(/\*/g, "").trim();
}

// Mismo texto de textoPlano, pero partido por línea en blanco para pintar párrafos
// reales en el <p> en vez de un solo bloque corrido — las respuestas de Nolan usan
// \n para separar ideas (ver lib/bluFaq.ts).
function parrafos(respuesta: string): string[] {
  return textoPlano(respuesta)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export default function AyudaPage() {
  // FAQPage es el único schema nuevo de esta página: reutiliza la MISMA base de
  // conocimiento que ya responde el chat de Nolan (lib/bluFaq.ts) en vez de escribir
  // una copia aparte, así que si mañana cambia una cifra o un plazo ahí, esta página
  // la hereda automáticamente sin que alguien se acuerde de actualizar dos lugares.
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: BLU_INTENTS.map((intent) => ({
      "@type": "Question",
      name: intent.quickReply || intent.id,
      acceptedAnswer: {
        "@type": "Answer",
        text: textoPlano(intent.respuesta),
      },
    })),
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: TITULO, item: `${SITE_URL}/ayuda` },
    ],
  };

  return (
    <>
      {/* safeJsonLd, no JSON.stringify a secas: aunque hoy BLU_INTENTS es texto fijo
          escrito a mano (ver lib/bluFaq.ts), mismo patrón defensivo que el resto del
          sitio (app/layout.tsx, app/categoria/[slug]/page.tsx) — ver lib/jsonLd.ts. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }} />

      <main style={{ maxWidth: 820, margin: "0 auto", padding: "32px 20px 80px" }}>
        <nav aria-label="breadcrumb" style={{ fontSize: "0.85rem", marginBottom: 20 }}>
          <Link href="/" style={{ color: THEME.primary, textDecoration: "none" }}>Inicio</Link>
          <span style={{ color: THEME.muted, margin: "0 6px" }}>/</span>
          <span style={{ color: THEME.muted }}>{TITULO}</span>
        </nav>

        <h1 style={{ fontSize: "2rem", fontWeight: 800, color: THEME.text, margin: "0 0 10px", lineHeight: 1.2 }}>
          🙋 {TITULO}
        </h1>
        <p style={{ fontSize: "1.05rem", color: THEME.textSoft, maxWidth: 640, lineHeight: 1.6, margin: "0 0 32px" }}>
          {DESCRIPCION}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {BLU_INTENTS.map((intent) => (
            <section
              key={intent.id}
              style={{
                background: THEME.surface,
                border: `1px solid ${THEME.border}`,
                borderRadius: 16,
                padding: "20px 24px",
              }}
            >
              <h2 style={{ fontSize: "1.05rem", fontWeight: 700, color: THEME.text, margin: "0 0 10px" }}>
                {intent.quickReply || intent.id}
              </h2>
              {parrafos(intent.respuesta).map((p, i) => (
                <p key={i} style={{ color: THEME.textSoft, lineHeight: 1.6, margin: i === 0 ? 0 : "10px 0 0" }}>
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>

        <div style={{ textAlign: "center", padding: "40px 20px 0" }}>
          <p style={{ color: THEME.muted, margin: "0 0 14px" }}>
            ¿No encontraste lo que buscabas? Escríbele a Nolan desde el botón de chat, o directo por WhatsApp.
          </p>
          <a
            href={urlWhatsappSoporte()}
            target="_blank"
            rel="noopener noreferrer"
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
            Escribir por WhatsApp
          </a>
        </div>
      </main>
    </>
  );
}
