"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { THEME } from "@/lib/theme";

function ResetForm() {
  const params        = useSearchParams();
  const router        = useRouter();
  const token         = params.get("token") || "";
  const [pass, setPass]     = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState("");
  const [done, setDone]     = useState(false);

  const inp = { width: "100%", padding: "11px 15px", borderRadius: 14, border: `1.5px solid ${THEME.border}`, background: "#ffffff", fontSize: 14, color: THEME.text, outline: "none", boxSizing: "border-box" as const };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pass !== confirm) { setError("Las contrasenas no coinciden"); return; }
    if (pass.length < 6) { setError("Minimo 6 caracteres"); return; }
    setLoading(true);
    setError("");
    try {
      const res  = await fetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password: pass }) });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Error al restablecer");
      else setDone(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: THEME.background, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: THEME.surfaceGradient, borderRadius: 24, padding: "36px 32px", width: "100%", maxWidth: 420, boxShadow: THEME.cardShadow, border: "1.5px solid transparent" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, margin: "0 auto 12px" }}>🔐</div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: THEME.text, margin: 0 }}>Nueva contrasena</h1>
        </div>

        {done ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
            <h2 style={{ color: THEME.text, fontWeight: 800, marginBottom: 8 }}>Contrasena actualizada</h2>
            <p style={{ color: THEME.muted, fontSize: 14, marginBottom: 24 }}>Ya puedes iniciar sesion con tu nueva contrasena.</p>
            <a href="/auth/login" style={{ display: "block", padding: "13px", background: `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`, color: "#fff", borderRadius: 14, fontSize: 15, fontWeight: 700, textDecoration: "none", textAlign: "center" }}>
              Ir al login
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: THEME.textSoft, textTransform: "uppercase" as const, marginBottom: 7 }}>Nueva contrasena *</label>
              <input type="password" placeholder="Minimo 6 caracteres" value={pass} onChange={e => setPass(e.target.value)} required style={inp}
                onFocus={e => { e.currentTarget.style.borderColor = THEME.primary; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(14,86,192,0.15)"; }}
                onBlur={e => { e.currentTarget.style.borderColor = THEME.border; e.currentTarget.style.boxShadow = "none"; }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: THEME.textSoft, textTransform: "uppercase" as const, marginBottom: 7 }}>Confirmar contrasena *</label>
              <input type="password" placeholder="Repite la contrasena" value={confirm} onChange={e => setConfirm(e.target.value)} required style={inp}
                onFocus={e => { e.currentTarget.style.borderColor = THEME.primary; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(14,86,192,0.15)"; }}
                onBlur={e => { e.currentTarget.style.borderColor = THEME.border; e.currentTarget.style.boxShadow = "none"; }} />
            </div>
            {error && <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.3)", color: "#b91c1c", fontSize: 13, fontWeight: 600, marginBottom: 16 }}>⚠️ {error}</div>}
            <button type="submit" disabled={loading} style={{ width: "100%", padding: "13px", background: `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`, color: "#fff", border: "none", borderRadius: 14, fontSize: 15, fontWeight: 700, cursor: "pointer", boxShadow: `0 4px 14px ${THEME.primary}44` }}>
              {loading ? "Guardando..." : "Guardar nueva contrasena"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return <Suspense fallback={<div>Cargando...</div>}><ResetForm /></Suspense>;
}
