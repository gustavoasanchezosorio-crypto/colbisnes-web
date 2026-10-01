import Link from "next/link";
import { THEME } from "@/lib/theme";
import { formatMoney } from "@/lib/utils";

// Tarjeta de solo lectura para listados renderizados en el servidor (hoy: páginas de
// categoría, ver app/categoria/[slug]/page.tsx). A propósito NO es la misma
// components/ProductCard.tsx del home: esa es 'use client' y depende de ocho props de
// callbacks (ofertas, pagos, confirmar entrega, favoritos con polling cada 5s, etc.)
// pensadas para la experiencia interactiva del feed logueado. Traer todo eso a una
// página cuyo trabajo es rankear en Google y mandar el clic a /product/[id] sería
// cargar de más (un intervalo de polling y un fetch de favoritos por cada tarjeta)
// sin ningún beneficio para quien todavía no hizo clic. Esta tarjeta no tiene estado
// ni 'use client': es puro servidor, así que no pesa nada en el bundle del cliente.
//
// `product` usa `any` a propósito, igual que ProductCard.tsx: es la misma forma de
// respuesta de GET /api/products (ver app/api/products/route.ts), que no tiene un
// tipo compartido declarado en el proyecto.
interface Props {
  product: any;
}

const condicionLabel = (c?: string) =>
  c === "NUEVO" ? "Nuevo" : c === "REACONDICIONADO" ? "Reacondicionado" : "Usado";

export default function CategoryProductCard({ product }: Props) {
  const vendido = product.status === "SOLD";

  return (
    <Link href={`/product/${product.id}`} style={{ textDecoration: "none", display: "block", height: "100%" }}>
      <div
        style={{
          background: THEME.surfaceGradient,
          borderRadius: 20,
          padding: 16,
          border: "1.5px solid transparent",
          boxShadow: THEME.cardShadow,
          height: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", aspectRatio: "4/3", background: "#eef2f7", marginBottom: 12 }}>
          {product.firstImage ? (
            <img
              src={product.firstImage}
              alt={product.title}
              loading="lazy"
              style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
            />
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40 }}>
              📦
            </div>
          )}
          {vendido && (
            <span
              style={{
                position: "absolute",
                top: 8,
                left: 8,
                background: "#0d1b2a",
                color: "#fff",
                fontSize: 11,
                fontWeight: 800,
                padding: "3px 10px",
                borderRadius: 20,
              }}
            >
              Vendido
            </span>
          )}
        </div>

        <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: THEME.text, margin: "0 0 6px", overflowWrap: "anywhere" }}>
          {product.title}
        </h3>

        <div style={{ fontSize: "1.25rem", fontWeight: 900, color: THEME.primary, margin: "0 0 8px" }}>
          {formatMoney(product.priceCOP)}
        </div>

        <div style={{ fontSize: "0.85rem", color: THEME.muted, display: "flex", gap: 10, flexWrap: "wrap", marginTop: "auto" }}>
          <span>📍 {product.city}</span>
          <span>{condicionLabel(product.condition)}</span>
        </div>
      </div>
    </Link>
  );
}
