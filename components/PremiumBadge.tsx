"use client";

// Badge compacto de verificación premium — se muestra junto al TrustBadge cuando
// el usuario tiene premiumStatus === "approved".
export default function PremiumBadge({ compact = false }: { compact?: boolean }) {
  const color = "#B45309";
  return (
    <span
      title="Verificación premium: cédula y comprobante de domicilio validados manualmente"
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        fontSize: compact ? 11 : 12, fontWeight: 700, padding: compact ? "2px 8px" : "3px 10px", borderRadius: 20,
        background: `${color}1a`, color, border: `1px solid ${color}44`,
      }}
    >
      ⭐ Premium
    </span>
  );
}
