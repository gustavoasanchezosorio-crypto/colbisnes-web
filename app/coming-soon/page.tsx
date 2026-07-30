"use client";

import { useEffect, useState } from "react";
import { THEME } from "@/lib/theme";
import { LAUNCH_AT_MS } from "@/lib/launch";

function calcularRestante(objetivoMs: number) {
  const total = Math.max(0, objetivoMs - Date.now());
  const dias = Math.floor(total / (1000 * 60 * 60 * 24));
  const horas = Math.floor((total / (1000 * 60 * 60)) % 24);
  const minutos = Math.floor((total / (1000 * 60)) % 60);
  const segundos = Math.floor((total / 1000) % 60);
  return { total, dias, horas, minutos, segundos };
}

export default function ComingSoonPage() {
  // Arrancamos en null para que el primer render (servidor y cliente) sea idéntico y
  // no haya "hydration mismatch"; el reloj se rellena en el efecto, ya en el cliente.
  const [t, setT] = useState<ReturnType<typeof calcularRestante> | null>(null);

  useEffect(() => {
    setT(calcularRestante(LAUNCH_AT_MS));
    const id = setInterval(() => {
      const r = calcularRestante(LAUNCH_AT_MS);
      setT(r);
      if (r.total <= 0) {
        clearInterval(id);
        // ¡Es la hora! El candado ya se abrió: mandamos a la app.
        window.location.href = "/";
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const dd = t ? String(t.dias) : "–";
  const hh = t ? String(t.horas).padStart(2, "0") : "–";
  const mm = t ? String(t.minutos).padStart(2, "0") : "–";
  const ss = t ? String(t.segundos).padStart(2, "0") : "–";

  const bloques = [
    { valor: dd, etiqueta: "Días" },
    { valor: hh, etiqueta: "Horas" },
    { valor: mm, etiqueta: "Min" },
    { valor: ss, etiqueta: "Seg" },
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: `linear-gradient(160deg, ${THEME.primaryDark} 0%, ${THEME.primary} 55%, ${THEME.primaryLight} 135%)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
        padding: "40px 20px",
        textAlign: "center",
        overflowX: "hidden",
      }}
    >
      <img
        src="/logo-white.svg?v=2"
        alt="Colbisnes"
        style={{ height: 62, width: "auto", marginBottom: 30 }}
      />

      <p
        style={{
          color: "rgba(255,255,255,0.82)",
          fontSize: 14,
          fontWeight: 800,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          margin: "0 0 12px",
        }}
      >
        Muy pronto
      </p>
      <h1
        style={{
          color: "#fff",
          fontSize: "clamp(22px, 6.2vw, 30px)",
          fontWeight: 900,
          margin: "0 0 10px",
          width: "100%",
          maxWidth: 580,
          boxSizing: "border-box",
          lineHeight: 1.2,
        }}
      >
        Estamos afinando los últimos detalles
      </h1>
      <p
        style={{
          color: "rgba(255,255,255,0.9)",
          fontSize: 16,
          margin: "0 0 42px",
          width: "100%",
          maxWidth: 520,
          boxSizing: "border-box",
          lineHeight: 1.5,
        }}
      >
        El marketplace colombiano para vender eso que ya no usas en casa —sin que
        nadie te tumbe. La plata queda protegida en custodia hasta que el trato se
        cumpla.
      </p>

      {/* Reloj regresivo */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 34,
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        {bloques.map((b) => (
          <div
            key={b.etiqueta}
            style={{
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.25)",
              borderRadius: 18,
              padding: "18px 12px",
              minWidth: 80,
              boxShadow: "0 12px 34px rgba(0,0,0,0.20)",
              backdropFilter: "blur(4px)",
            }}
          >
            <div
              style={{
                color: "#fff",
                fontSize: 42,
                fontWeight: 900,
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {b.valor}
            </div>
            <div
              style={{
                color: "rgba(255,255,255,0.8)",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                marginTop: 8,
              }}
            >
              {b.etiqueta}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 9,
          background: "rgba(255,255,255,0.14)",
          border: "1px solid rgba(255,255,255,0.3)",
          borderRadius: 999,
          padding: "10px 20px",
        }}
      >
        <span style={{ fontSize: 16 }}>🗓️</span>
        <span style={{ color: "#fff", fontSize: 15, fontWeight: 700 }}>
          12 de agosto · 10:20 a.m. (hora de Colombia)
        </span>
      </div>

      {/* Firma del fundador, en su azul original. Se saca de la imagen escaneada
          recortando la silueta por inundación desde los bordes: así los brillos
          claros que caen DENTRO de un trazo no quedan como huecos transparentes.
          No se le toca el color, solo se le quita el fondo blanco.

          Va sin reducción de paleta: con 96 colores el degradado metálico se cortaba
          en bandas y parecía pixelada. Las dos sombras dan el relieve —una corta que
          la despega del fondo azul y otra amplia que aporta profundidad—. El ?v=2
          fuerza a los navegadores a bajar la versión nueva pese al mismo nombre. */}
      <img
        src="/firma-gustavo.png?v=3"
        alt="Firma de Gustavo Osorio, fundador de Colbisnes"
        style={{
          width: "min(340px, 78%)",
          height: "auto",
          marginTop: 46,
          // Dos sombras: una corta que despega la firma del fondo y otra amplia
          // que le da profundidad.
          //
          // A propósito NO se usa image-rendering: crisp-edges. Esa propiedad
          // apaga el remuestreo del navegador (pasa a vecino más cercano), y el
          // remuestreo es justamente lo que hace que un PNG de 1200 px se vea
          // limpio dentro de 340 px. Con crisp-edges los trazos finos y las
          // diagonales salen con escaleritas.
          filter:
            "drop-shadow(0 2px 3px rgba(2,14,38,0.45)) drop-shadow(0 8px 18px rgba(2,14,38,0.35))",
        }}
      />

      <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 16 }}>
        © 2026 Colbisnes · Compra y venta protegida
      </p>
    </div>
  );
}
