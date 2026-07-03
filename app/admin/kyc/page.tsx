"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { THEME } from "@/lib/theme";

interface KycUser {
  id: string;
  name: string | null;
  email: string;
  kycStatus: string;
  kycRequestedAt: string | null;
  docs: { selfieUrl?: string; cedulaUrl?: string };
}

export default function AdminKycPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [usuarios, setUsuarios] = useState<KycUser[]>([]);
  const [filtro, setFiltro] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/login");
  }, [status, router]);

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    fetch(`/api/admin/kyc?status=${filtro}`)
      .then((r) => r.json())
      .then((d) => { setUsuarios(d.usuarios || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [session, filtro]);

  async function aprobar(userId: string) {
    setActionLoading(userId + "_ok");
    setMsg("");
    const r = await fetch("/api/kyc/approve", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const d = await r.json();
    setActionLoading(null);
    if (r.ok) {
      setMsg("✅ Usuario aprobado y notificado");
      setUsuarios((prev) => prev.filter((u) => u.id !== userId));
    } else {
      setMsg("❌ " + d.error);
    }
  }

  async function rechazar(userId: string) {
    const motivo = prompt("Motivo del rechazo (opcional):");
    setActionLoading(userId + "_no");
    setMsg("");
    const r = await fetch("/api/admin/kyc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, motivo }),
    });
    const d = await r.json();
    setActionLoading(null);
    if (r.ok) {
      setMsg("❌ KYC rechazado y usuario notificado");
      setUsuarios((prev) => prev.filter((u) => u.id !== userId));
    } else {
      setMsg("❌ " + d.error);
    }
  }

  if (status === "loading" || !session) return null;

  return (
    <div style={{ minHeight: "100vh", background: THEME.background, fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <header style={{ background: `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`, padding: "0 24px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/logo-white.svg?v=2" alt="Colbisnes" style={{ height: 38, width: "auto" }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", padding: "3px 10px", borderRadius: 20 }}>KYC</span>
        </div>
        <button onClick={() => router.push("/")} style={{ padding: "7px 16px", borderRadius: 20, border: "1.5px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.12)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>← Inicio</button>
      </header>

      <main style={{ maxWidth: 900, margin: "32px auto", padding: "0 20px 80px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: THEME.text, marginBottom: 20, textAlign: "center" }}>Verificaciones KYC</h1>

        {/* Filtro tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          {["pending", "approved", "rejected"].map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              style={{
                padding: "8px 20px", borderRadius: 20, border: `1.5px solid ${THEME.primary}`,
                background: filtro === f ? THEME.primary : "transparent",
                color: filtro === f ? "#fff" : THEME.primary,
                fontWeight: 700, fontSize: 13, cursor: "pointer",
              }}
            >
              {f === "pending" ? "⏳ Pendientes" : f === "approved" ? "✅ Aprobados" : "❌ Rechazados"}
            </button>
          ))}
        </div>

        {msg && <div style={{ padding: "12px 16px", borderRadius: 12, background: msg.startsWith("✅") ? "#dcfce7" : "#fee2e2", border: "1px solid " + (msg.startsWith("✅") ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)"), color: msg.startsWith("✅") ? "#15803d" : "#b91c1c", marginBottom: 20, fontWeight: 600 }}>{msg}</div>}

        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: THEME.muted }}>Cargando...</div>
        ) : usuarios.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: THEME.muted }}>No hay solicitudes {filtro === "pending" ? "pendientes" : filtro === "approved" ? "aprobadas" : "rechazadas"}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {usuarios.map((u) => (
              <div key={u.id} style={{ background: THEME.surfaceGradient, borderRadius: 20, padding: 24, boxShadow: THEME.cardShadow, border: "1.5px solid transparent" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                  <div>
                    <p style={{ fontWeight: 800, fontSize: 16, color: THEME.text, margin: "0 0 4px" }}>{u.name || "Sin nombre"}</p>
                    <p style={{ fontSize: 13, color: THEME.textSoft, margin: "0 0 4px" }}>{u.email}</p>
                    <p style={{ fontSize: 12, color: THEME.muted, margin: 0 }}>
                      Solicitado: {u.kycRequestedAt ? new Date(u.kycRequestedAt).toLocaleString("es-CO") : "—"}
                    </p>
                  </div>
                  {filtro === "pending" && (
                    <div style={{ display: "flex", gap: 10 }}>
                      <button
                        onClick={() => aprobar(u.id)}
                        disabled={!!actionLoading}
                        style={{ padding: "10px 22px", borderRadius: 12, background: "#10B981", color: "#fff", border: "none", fontWeight: 800, fontSize: 14, cursor: "pointer" }}
                      >
                        {actionLoading === u.id + "_ok" ? "..." : "✅ Aprobar"}
                      </button>
                      <button
                        onClick={() => rechazar(u.id)}
                        disabled={!!actionLoading}
                        style={{ padding: "10px 22px", borderRadius: 12, background: "#EF4444", color: "#fff", border: "none", fontWeight: 800, fontSize: 14, cursor: "pointer" }}
                      >
                        {actionLoading === u.id + "_no" ? "..." : "❌ Rechazar"}
                      </button>
                    </div>
                  )}
                </div>

                {/* Fotos */}
                <div style={{ display: "flex", gap: 16 }}>
                  {u.docs.selfieUrl && (
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Selfie</p>
                      <div
                        style={{ borderRadius: 12, overflow: "hidden", cursor: "zoom-in", background: THEME.surfaceAlt, aspectRatio: "1", position: "relative" }}
                        onClick={() => setLightbox(u.docs.selfieUrl!)}
                      >
                        <img src={u.docs.selfieUrl} alt="Selfie" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </div>
                    </div>
                  )}
                  {u.docs.cedulaUrl && (
                    <div style={{ flex: 1.6 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Cédula</p>
                      <div
                        style={{ borderRadius: 12, overflow: "hidden", cursor: "zoom-in", background: THEME.surfaceAlt, aspectRatio: "16/10", position: "relative" }}
                        onClick={() => setLightbox(u.docs.cedulaUrl!)}
                      >
                        <img src={u.docs.cedulaUrl} alt="Cédula" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </div>
                    </div>
                  )}
                  {!u.docs.selfieUrl && !u.docs.cedulaUrl && (
                    <p style={{ color: THEME.muted, fontSize: 13 }}>Sin documentos adjuntos</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Lightbox */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out" }}
        >
          <img src={lightbox} alt="Documento KYC" style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: 16, objectFit: "contain" }} />
        </div>
      )}
    </div>
  );
}
