"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { THEME } from "@/lib/theme";

type Estado = "verificando" | "ok" | "error";

function VerifyInner() {
  const params = useSearchParams();
  const token = params.get("token") || "";

  const [estado, setEstado] = useState<Estado>("verificando");
  const [error, setError] = useState("");

  // Reenvío
  const [email, setEmail] = useState("");
  const [reenviando, setReenviando] = useState(false);
  const [reenviado, setReenviado] = useState(false);

  useEffect(() => {
    if (!token) {
      setEstado("error");
      setError("Falta el token de verificación en el enlace.");
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (res.ok) setEstado("ok");
        else {
          setEstado("error");
          setError(data.error || "No se pudo verificar el correo.");
        }
      } catch {
        setEstado("error");
        setError("Error de conexión. Intenta de nuevo.");
      }
    })();
  }, [token]);

  const reenviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setReenviando(true);
    try {
      await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setReenviado(true);
    } finally {
      setReenviando(false);
    }
  };

  const inp = { width: "100%", padding: "11px 15px", borderRadius: 14, border: `1.5px solid ${THEME.border}`, background: "#ffffff", fontSize: 14, color: THEME.text, outline: "none", boxSizing: "border-box" as const };
  const btn = { display: "block", width: "100%", padding: "13px", background: `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`, color: "#fff", border: "none", borderRadius: 14, fontSize: 15, fontWeight: 700, textDecoration: "none", textAlign: "center" as const, cursor: "pointer" };

  return (
    <div style={{ minHeight: "100vh", background: THEME.background, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: THEME.surfaceGradient, borderRadius: 24, padding: "36px 32px", width: "100%", maxWidth: 420, boxShadow: THEME.cardShadow, border: "1.5px solid transparent", textAlign: "center" }}>

        {estado === "verificando" && (
          <>
            <div style={{ fontSize: 56, marginBottom: 16 }}>⏳</div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: THEME.text, margin: 0 }}>Verificando tu correo…</h1>
          </>
        )}

        {estado === "ok" && (
          <>
            <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: THEME.text, margin: "0 0 8px" }}>¡Correo confirmado!</h1>
            <p style={{ color: THEME.muted, fontSize: 14, marginBottom: 24 }}>Tu cuenta ya está activa. Ya puedes comprar y vender en Colbisnes.</p>
            <a href="/auth/login" style={btn}>Iniciar sesión</a>
          </>
        )}

        {estado === "error" && (
          <>
            <div style={{ fontSize: 56, marginBottom: 16 }}>⚠️</div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: THEME.text, margin: "0 0 8px" }}>No pudimos confirmar tu correo</h1>
            <p style={{ color: THEME.muted, fontSize: 14, marginBottom: 20 }}>{error}</p>

            {reenviado ? (
              <p style={{ color: THEME.text, fontSize: 14, fontWeight: 600 }}>
                Si tu correo está registrado y sin confirmar, te enviamos un nuevo enlace. Revisa tu bandeja.
              </p>
            ) : (
              <form onSubmit={reenviar}>
                <p style={{ color: THEME.textSoft, fontSize: 13, marginBottom: 10, textAlign: "left" }}>Reenviar el enlace de confirmación:</p>
                <input type="email" placeholder="tu@correo.com" value={email} onChange={e => setEmail(e.target.value)} required style={{ ...inp, marginBottom: 12 }} />
                <button type="submit" disabled={reenviando} style={btn}>
                  {reenviando ? "Enviando…" : "Reenviar enlace"}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return <Suspense fallback={<div>Cargando…</div>}><VerifyInner /></Suspense>;
}
