"use client";

import { useEffect, useState } from "react";
import { THEME } from "@/lib/theme";
import PremiumBadge from "./PremiumBadge";

interface TrustScoreData {
  score: number;
  label: string;
  reviewsAvg: number | null;
  reviewsCount: number;
  completedOrdersCount: number;
  premium?: boolean;
}

const COLOR_POR_LABEL: Record<string, string> = {
  "Nuevo": "#94A3B8",
  "Básico": "#F59E0B",
  "Confiable": "#0e56c0",
  "Muy confiable": "#15803d",
  "Élite": "#7c3aed",
};

// Rangos del score de confianza (0-100), en orden — usados en el recuadro explicativo
const RANGOS: Array<{ label: string; min: number; max: number; desc: string }> = [
  { label: "Nuevo", min: 0, max: 19, desc: "Cuenta reciente, todavía sin historial suficiente en Colbisnes." },
  { label: "Básico", min: 20, max: 39, desc: "Ya tiene algo de actividad y verificación inicial de identidad." },
  { label: "Confiable", min: 40, max: 64, desc: "Buen historial de pedidos completados y calificaciones positivas." },
  { label: "Muy confiable", min: 65, max: 84, desc: "Historial sólido y consistente, muy bien calificado por otros usuarios." },
  { label: "Élite", min: 85, max: 100, desc: "El nivel más alto de confianza dentro de Colbisnes." },
];

// Badge compacto de score de confianza — se usa en perfil público y en la ficha de producto.
// Al tocarlo, muestra un recuadro explicando qué significa cada rango de puntaje.
export default function TrustBadge({ userId, compact = false }: { userId: string; compact?: boolean }) {
  const [data, setData] = useState<TrustScoreData | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    let activo = true;
    fetch(`/api/trust-score/${userId}`)
      .then(r => r.json())
      .then(d => { if (activo && !d.error) setData(d); })
      .catch(() => {});
    return () => { activo = false; };
  }, [userId]);

  if (!data) return null;

  const color = COLOR_POR_LABEL[data.label] || THEME.primary;

  return (
    <>
      {compact ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span
            onClick={() => setShowInfo(true)}
            role="button"
            tabIndex={0}
            title={`Score de confianza: ${data.score}/100 — toca para ver los rangos`}
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
              background: `${color}1a`, color, border: `1px solid ${color}44`,
              cursor: "pointer",
            }}
          >
            {data.label} · {data.score}
          </span>
          {data.premium && <PremiumBadge compact />}
        </span>
      ) : (
        <div
          onClick={() => setShowInfo(true)}
          role="button"
          tabIndex={0}
          title="Toca para ver los rangos del score de confianza"
          style={{
            display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
            borderRadius: 14, background: `${color}0d`, border: `1px solid ${color}33`,
            cursor: "pointer",
          }}
        >
          <div style={{
            width: 40, height: 40, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
            background: color, color: "#fff", fontWeight: 900, fontSize: 14, flexShrink: 0,
          }}>
            {data.score}
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <p style={{ margin: 0, fontWeight: 800, fontSize: 13, color }}>{data.label}</p>
              {data.premium && <PremiumBadge compact />}
            </div>
            <p style={{ margin: 0, fontSize: 11, color: THEME.muted }}>
              {data.reviewsCount > 0 ? `⭐ ${data.reviewsAvg?.toFixed(1)} (${data.reviewsCount})` : "Sin calificaciones aún"}
              {data.completedOrdersCount > 0 ? ` · ${data.completedOrdersCount} pedidos completados` : ""}
            </p>
          </div>
        </div>
      )}

      {showInfo && (
        <div
          onClick={() => setShowInfo(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 2000,
            background: "rgba(10,22,40,0.45)",
            backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
            animation: "trustFadeIn 0.2s ease",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 360,
              background: THEME.surfaceGradient,
              borderRadius: 20,
              padding: "20px 22px 22px",
              boxShadow: "0 24px 70px rgba(10,46,107,0.35)",
              border: "1.5px solid transparent",
              maxHeight: "85vh", overflowY: "auto",
              animation: "trustSlideUp 0.25s cubic-bezier(0.32,0.72,0,1)",
            }}
          >
            <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: THEME.text, width: "100%", textAlign: "center" }}>Score de confianza</h3>
              <button
                onClick={() => setShowInfo(false)}
                aria-label="Cerrar"
                style={{ width: 26, height: 26, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.06)", color: THEME.muted, fontSize: 14, cursor: "pointer", flexShrink: 0, position: "absolute", right: 0, top: 0 }}
              >
                ×
              </button>
            </div>
            <p style={{ margin: "2px 0 14px", fontSize: 12, color: THEME.muted, lineHeight: 1.5 }}>
              Se calcula con verificación de identidad, calificaciones recibidas, pedidos completados y antigüedad de la cuenta.
            </p>

            <div style={{ display: "grid", gap: 8 }}>
              {RANGOS.map(r => {
                const esNivelActual = data.label === r.label;
                const c = COLOR_POR_LABEL[r.label];
                return (
                  <div
                    key={r.label}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 10px", borderRadius: 12,
                      background: esNivelActual ? `${c}14` : "transparent",
                      border: `1.5px solid ${esNivelActual ? c + "55" : THEME.border}`,
                    }}
                  >
                    <div style={{ width: 34, height: 30, borderRadius: 10, background: c, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 10, flexShrink: 0 }}>
                      {r.min}-{r.max}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontWeight: 800, fontSize: 12.5, color: c }}>
                        {r.label}{esNivelActual ? " · nivel actual" : ""}
                      </p>
                      <p style={{ margin: "1px 0 0", fontSize: 10.5, color: THEME.muted, lineHeight: 1.35 }}>{r.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <style>{`
            @keyframes trustFadeIn  { from { opacity: 0; } to { opacity: 1; } }
            @keyframes trustSlideUp { from { transform: translateY(24px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
          `}</style>
        </div>
      )}
    </>
  );
}
