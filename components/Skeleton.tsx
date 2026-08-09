'use client';

import React from 'react';
import { THEME } from '@/lib/theme';

/* Bloques grises que se ven mientras cargan las publicaciones.
 *
 * La regla de un esqueleto es una sola: tiene que ocupar el MISMO espacio que lo que
 * va a llegar. Si no, cuando llegan las tarjetas la página se recompone entera y da un
 * brinco. Este se había quedado atrás en tres cosas a la vez:
 *
 *   1. No dibujaba la foto, y la tarjeta real lleva una foto 4/3 grande arriba: era,
 *      de lejos, la mayor parte del alto que faltaba.
 *   2. Ponía el precio a la derecha del título, que es como estaba la tarjeta antes de
 *      que el precio se pasara a su propio renglón (ver components/ProductCard.tsx).
 *   3. Su grilla era minmax(340px) con separación 24, contra minmax(min(320px,100%))
 *      con separación 20 de la portada: salía con distinta cantidad de columnas que
 *      las tarjetas reales.
 *
 * Las medidas de aquí abajo salen de las de ProductCard.tsx: si allá se cambia un
 * tamaño de letra o un margen, este archivo se desactualiza y vuelve el brinco.
 */

const gris: React.CSSProperties = { background: "rgba(0,0,0,0.08)", borderRadius: 4 };

export const ProductCardSkeleton: React.FC = () => (
  <div style={{
    background: THEME.surfaceGradient,
    borderRadius: 20,
    padding: 20,
    border: "1.5px solid transparent",
    boxShadow: THEME.cardShadow,
    // El latido ahora sí existe: @keyframes pulse está en globals.css. Antes se
    // invocaba una animación que no estaba definida y los bloques quedaban quietos.
    animation: "pulse 1.5s infinite",
  }}>
    {/* Foto: mismo aspecto 4/3, mismo radio y mismo margen inferior que la real. */}
    <div style={{ ...gris, aspectRatio: "4/3", borderRadius: 12, marginBottom: 12 }} />

    {/* Título: 1.3rem ≈ 25px de alto, marginBottom 6. */}
    <div style={{ ...gris, height: 25, width: "75%", marginBottom: 6 }} />

    {/* Ciudad y estado: dos etiquetas de 0.9rem separadas 12, marginBottom 8. */}
    <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
      <div style={{ ...gris, height: 17, width: 96 }} />
      <div style={{ ...gris, height: 17, width: 84 }} />
    </div>

    {/* Precio: renglón propio, 1.8rem ≈ 33px, con el mismo margen 12/2. */}
    <div style={{ ...gris, height: 33, width: 168, borderRadius: 6, margin: "12px 0 2px" }} />

    {/* Descripción: dos renglones de 0.9rem con interlineado 1.5. */}
    <div style={{ ...gris, height: 14, marginTop: 8, marginBottom: 8 }} />
    <div style={{ ...gris, height: 14, width: "62%" }} />

    {/* Vendedor: el nombre y, al lado, la pastilla de calificación. */}
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
      <div style={{ ...gris, height: 20, width: "52%" }} />
      <div style={{ ...gris, height: 20, width: 64, borderRadius: 999 }} />
    </div>

    {/* Botones de acción. */}
    <div style={{ display: "flex", gap: 12, paddingTop: 20 }}>
      <div style={{ ...gris, height: 42, width: 160, borderRadius: 12 }} />
      <div style={{ ...gris, height: 42, width: 118, borderRadius: 12 }} />
    </div>
  </div>
);

export const SkeletonGrid: React.FC<{ count?: number }> = ({ count = 6 }) => (
  <div style={{
    display: "grid",
    // Idéntica a la grilla de la portada (app/page.tsx). El min(320px, 100%) no es
    // adorno: un minmax(320px…) pelado es un piso RÍGIDO y en un teléfono angosto
    // empuja la página hacia el lado con barra horizontal y todo.
    gridTemplateColumns: "repeat(auto-fill, minmax(min(320px, 100%), 1fr))",
    gap: 20,
  }}>
    {Array.from({ length: count }).map((_, i) => (
      <ProductCardSkeleton key={i} />
    ))}
  </div>
);
