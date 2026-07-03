"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { THEME } from "@/lib/theme";

export default function KycPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [kycStatus, setKycStatus] = useState<string>("none");
  const [loading, setLoading] = useState(true);
  const [iniciando, setIniciando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/login");
  }, [status, router]);

  useEffect(() => {
    if (session) {
      fetch("/api/kyc/status", { credentials: "include" })
        .then((r) => r.json())
        .then((d) => { setKycStatus(d.kycStatus || "none"); setLoading(false); })
        .catch(() => setLoading(false));
    }
  }, [session]);

  async function iniciarVerificacion() {
    setIniciando(true);
    setError("");
    try {
      const r = await fetch("/api/kyc/start", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Error al iniciar la verificación");
      if (d.verificationUrl) {
        window.location.href = d.verificationUrl;
      } else if (d.status === "approved") {
        setKycStatus("approved");
        setIniciando(false);
      } else {
        throw new Error("No se pudo generar el enlace de verificación");
      }
    } catch (err: any) {
      setError(err.message);
      setIniciando(false);
    }
  }

  if (loading || !session) return (
    <div style={{ minHeight: "100vh", background: THEME.background, display: "flex", alignItems: "center", justifyContent: "center", color: THEME.muted }}>
      Cargando...
    </div>
  );

  // ────────────── Ya verificado ──────────────
  if (kycStatus === "approved") return (
    <Wrapper router={router}>
      <div style={{ background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 20, padding: "36px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>✅</div>
        <h2 style={{ fontSize: 20, fontWeight: 900, color: THEME.text, margin: "0 0 8px" }}>Identidad verificada</h2>
        <p style={{ color: "#15803d", fontSize: 14, margin: "0 0 20px", lineHeight: 1.6 }}>Tu cuenta está verificada. Ya puedes publicar productos y hacer negocios en Colbisnes.</p>
        <button onClick={() => router.push("/")} style={{ padding: "12px 28px", borderRadius: 16, border: "none", background: "#10B981", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
          Ir a Colbisnes →
        </button>
      </div>
    </Wrapper>
  );

  // ────────────── Pendiente de revisión (esperando webhook de Didit) ──────────────
  if (kycStatus === "pending") return (
    <Wrapper router={router}>
      <div style={{ background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 20, padding: "36px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>⏳</div>
        <h2 style={{ fontSize: 20, fontWeight: 900, color: "#b45309", margin: "0 0 8px" }}>Verificando tu identidad</h2>
        <p style={{ color: THEME.textSoft, fontSize: 14, margin: "0 0 20px", lineHeight: 1.6 }}>
          Estamos procesando tu verificación biométrica. Normalmente toma menos de 2 minutos. Si ya completaste el proceso, toca el botón para revisar el estado.
        </p>
        <button onClick={() => window.location.reload()} style={{ padding: "12px 28px", borderRadius: 16, border: "none", background: "#F59E0B", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
          Revisar estado
        </button>
      </div>
    </Wrapper>
  );

  // ────────────── Intro / iniciar verificación con Didit ──────────────
  return (
    <Wrapper router={router}>
      {error && (
        <div style={{ padding: "10px 16px", borderRadius: 12, background: "rgba(239,68,68,0.10)", color: "#b91c1c", fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={{ background: THEME.surfaceGradient, borderRadius: 20, border: "1.5px solid transparent", overflow: "hidden", boxShadow: THEME.cardShadow }}>
        <div style={{ height: 4, background: `linear-gradient(90deg,${THEME.primaryLight},${THEME.primary})` }} />
        <div style={{ padding: "28px 24px" }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: THEME.text, margin: "0 0 6px", textAlign: "center" }}>Verifica tu identidad</h2>
          <p style={{ fontSize: 13, color: THEME.muted, margin: "0 0 20px", lineHeight: 1.6 }}>
            Para publicar productos en Colbisnes necesitamos confirmar que eres una persona real. El proceso es guiado, seguro y solo toma un par de minutos.
          </p>

          <div style={{ display: "grid", gap: 10, marginBottom: 24 }}>
            {[
              { icon: "🪪", title: "Foto de tu cédula", desc: "Escaneo guiado de tu documento — validación automática" },
              { icon: "🤳", title: "Prueba de vida en tiempo real", desc: "Verificamos que eres tú, en el momento, con detección de vida (liveness)" },
              { icon: "🔒", title: "100% confidencial", desc: "Tus datos se procesan de forma cifrada y solo se usan para verificar tu identidad" },
            ].map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 14, padding: "12px 16px", borderRadius: 14, background: THEME.surfaceAlt, border: `1px solid ${THEME.border}` }}>
                <span style={{ fontSize: 24, flexShrink: 0 }}>{r.icon}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: THEME.text, marginBottom: 2 }}>{r.title}</div>
                  <div style={{ fontSize: 12, color: THEME.muted }}>{r.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {kycStatus === "rejected" && (
            <div style={{ padding: "12px 16px", borderRadius: 14, background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.3)", marginBottom: 20 }}>
              <p style={{ fontSize: 13, color: "#b91c1c", fontWeight: 600, margin: 0 }}>
                ⚠️ Tu verificación anterior no pudo completarse. Por favor intenta de nuevo asegurando buena iluminación y que el documento sea legible.
              </p>
            </div>
          )}

          <button
            onClick={iniciarVerificacion}
            disabled={iniciando}
            style={{ width: "100%", padding: 14, borderRadius: 16, border: "none", background: `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`, color: "#fff", fontSize: 15, fontWeight: 700, cursor: iniciando ? "wait" : "pointer", boxShadow: `0 4px 14px ${THEME.primary}44`, opacity: iniciando ? 0.75 : 1 }}
          >
            {iniciando ? "Preparando verificación..." : "🪪 Comenzar verificación"}
          </button>
        </div>
      </div>
    </Wrapper>
  );
}

function Wrapper({ children, router }: { children: React.ReactNode; router: ReturnType<typeof useRouter> }) {
  return (
    <div style={{ minHeight: "100vh", background: THEME.background, fontFamily: "system-ui,sans-serif" }}>
      <header style={{ background: `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`, padding: "0 24px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <img src="/logo-white.svg?v=2" alt="Colbisnes" style={{ height: 40, width: "auto" }} />
        <button onClick={() => router.back()} style={{ padding: "7px 16px", borderRadius: 20, border: "1.5px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.12)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          ← Volver
        </button>
      </header>

      <main style={{ maxWidth: 520, margin: "36px auto", padding: "0 20px 80px" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: THEME.text, margin: "0 0 6px" }}>Verificación de identidad</h1>
          <p style={{ fontSize: 13, color: THEME.muted, margin: 0, lineHeight: 1.6 }}>Requerida para publicar productos en Colbisnes</p>
        </div>

        {children}
      </main>
    </div>
  );
}
