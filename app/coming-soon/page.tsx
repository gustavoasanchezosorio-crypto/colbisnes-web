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
        El marketplace colombiano donde compras y vendes con el dinero protegido en
        custodia. Nos lanzamos muy pronto.
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

      {/* Firma del fundador. Se genera a partir de la firma original (azul brillante
          sobre blanco) recortando la silueta exacta y mapeando su luminosidad a una
          rampa dorada, para que resalte sobre el degradado azul del fondo sin perder
          el relieve metálico. */}
      <img
        src="/firma-dorada.png"
        alt="Firma de Gustavo Osorio, fundador de Colbisnes"
        style={{
          width: "min(285px, 72%)",
          height: "auto",
          marginTop: 46,
          opacity: 0.95,
        }}
      />

      <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 16 }}>
        © 2026 Colbisnes · Compra y venta protegida
      </p>
    </div>
  );
}
