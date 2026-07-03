"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { THEME } from "@/lib/theme";

interface DisputeItem {
  id: string;
  orderId: string;
  reason: string;
  detalle: string | null;
  evidence: string[];
  status: string;
  adminNotes: string | null;
  createdAt: string;
  raisedByUser: { id: string; name: string | null; email: string };
  raisedAgainstUser: { id: string; name: string | null; email: string };
  order: { id: string; estado: string; totalPagado: number; numeroGuia: string | null; transportadora: string | null } | null;
  product: { id: string; title: string; priceCOP: number } | null;
  prioritaria?: boolean;
}

const ESTADO_LABEL: Record<string, string> = {
  OPEN: "🟡 Abierta",
  UNDER_REVIEW: "🔎 En revisión",
  RESOLVED_BUYER: "✅ Resuelta a favor del comprador",
  RESOLVED_SELLER: "✅ Resuelta a favor del vendedor",
  CANCELLED: "❌ Cancelada",
};

export default function AdminDisputasPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [disputas, setDisputas] = useState<DisputeItem[]>([]);
  const [filtro, setFiltro] = useState("OPEN");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notaPorId, setNotaPorId] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/login");
  }, [status, router]);

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    fetch(`/api/admin/disputes?status=${filtro}`)
      .then(r => r.json())
      .then(d => { setDisputas(d.disputes || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [session, filtro]);

  async function resolver(disputeId: string, nuevoStatus: string) {
    setBusyId(disputeId);
    setMsg("");
    try {
      const r = await fetch("/api/admin/disputes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disputeId, status: nuevoStatus, adminNotes: notaPorId[disputeId] || undefined }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Error al resolver");
      setMsg("✅ Disputa actualizada");
      setDisputas(prev => prev.filter(x => x.id !== disputeId));
    } catch (e: any) {
      setMsg("❌ " + e.message);
    } finally {
      setBusyId(null);
    }
  }

  if (status === "loading" || !session) return null;

  return (
    <div style={{ minHeight: "100vh", background: THEME.background, fontFamily: "system-ui, sans-serif" }}>
      <header style={{ background: `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`, padding: "0 24px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/logo-white.svg?v=2" alt="Colbisnes" style={{ height: 38, width: "auto" }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", padding: "3px 10px", borderRadius: 20 }}>DISPUTAS</span>
        </div>
        <button onClick={() => router.push("/admin")} style={{ padding: "7px 16px", borderRadius: 20, border: "1.5px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.12)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>← Admin</button>
      </header>

      <main style={{ maxWidth: 900, margin: "32px auto", padding: "0 20px 80px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: THEME.text, marginBottom: 20, textAlign: "center" }}>Disputas de pedidos</h1>

        <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
          {["OPEN", "UNDER_REVIEW", "RESOLVED_BUYER", "RESOLVED_SELLER", "CANCELLED"].map(f => (
            <button key={f} onClick={() => setFiltro(f)} style={{
              padding: "8px 16px", borderRadius: 20, border: `1.5px solid ${THEME.primary}`,
              background: filtro === f ? THEME.primary : "transparent",
              color: filtro === f ? "#fff" : THEME.primary,
              fontWeight: 700, fontSize: 12.5, cursor: "pointer",
            }}>
              {ESTADO_LABEL[f]}
            </button>
          ))}
        </div>

        {msg && <div style={{ padding: "12px 16px", borderRadius: 12, background: msg.startsWith("✅") ? "#dcfce7" : "#fee2e2", color: msg.startsWith("✅") ? "#15803d" : "#b91c1c", marginBottom: 20, fontWeight: 600 }}>{msg}</div>}

        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: THEME.muted }}>Cargando...</div>
        ) : disputas.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: THEME.muted }}>No hay disputas en este estado</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {disputas.map(d => (
              <div key={d.id} style={{ background: THEME.surfaceGradient, borderRadius: 20, padding: 22, boxShadow: THEME.cardShadow, border: d.prioritaria ? "1.5px solid #D97706" : "1.5px solid transparent" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <p style={{ fontWeight: 800, fontSize: 15, color: THEME.text, margin: "0 0 4px" }}>
                        {d.product?.title || "Producto no disponible"}
                      </p>
                      {d.prioritaria && (
                        <span style={{ fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: "#FEF3C7", color: "#B45309" }}>
                          ⚡ Prioritaria
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: 12, color: THEME.muted, margin: 0 }}>
                      Orden #{d.orderId.slice(-8)} · {new Date(d.createdAt).toLocaleString("es-CO")}
                    </p>
                  </div>
                  <span style={{ fontSize: 11.5, fontWeight: 700, padding: "4px 10px", borderRadius: 20, background: THEME.surfaceAlt, color: THEME.textSoft }}>
                    {ESTADO_LABEL[d.status] || d.status}
                  </span>
                </div>

                <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 12, fontSize: 13 }}>
                  <div>
                    <p style={{ color: THEME.muted, margin: "0 0 2px", fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>Reportado por</p>
                    <p style={{ color: THEME.text, margin: 0, fontWeight: 700 }}>{d.raisedByUser.name || d.raisedByUser.email}</p>
                  </div>
                  <div>
                    <p style={{ color: THEME.muted, margin: "0 0 2px", fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>Contra</p>
                    <p style={{ color: THEME.text, margin: 0, fontWeight: 700 }}>{d.raisedAgainstUser.name || d.raisedAgainstUser.email}</p>
                  </div>
                  {d.order && (
                    <div>
                      <p style={{ color: THEME.muted, margin: "0 0 2px", fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>Envío</p>
                      <p style={{ color: THEME.text, margin: 0, fontWeight: 700 }}>{d.order.transportadora || "—"} {d.order.numeroGuia ? `· ${d.order.numeroGuia}` : ""}</p>
                    </div>
                  )}
                </div>

                <div style={{ background: THEME.surfaceAlt, borderRadius: 12, padding: "10px 14px", marginBottom: 12 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: THEME.muted, margin: "0 0 4px", textTransform: "uppercase" }}>Motivo: {d.reason}</p>
                  {d.detalle && <p style={{ fontSize: 13, color: THEME.textSoft, margin: 0 }}>{d.detalle}</p>}
                </div>

                {d.evidence?.length > 0 && (
                  <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                    {d.evidence.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer">
                        <img src={url} alt={`evidencia ${i + 1}`} style={{ width: 70, height: 70, objectFit: "cover", borderRadius: 10, border: `1px solid ${THEME.border}` }} />
                      </a>
                    ))}
                  </div>
                )}

                {(d.status === "OPEN" || d.status === "UNDER_REVIEW") && (
                  <>
                    <textarea
                      placeholder="Notas del admin (opcional)"
                      value={notaPorId[d.id] || ""}
                      onChange={e => setNotaPorId(prev => ({ ...prev, [d.id]: e.target.value }))}
                      rows={2}
                      style={{ width: "100%", padding: 10, borderRadius: 10, border: `1px solid ${THEME.border}`, fontSize: 13, marginBottom: 10, boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }}
                    />
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {d.status === "OPEN" && (
                        <button onClick={() => resolver(d.id, "UNDER_REVIEW")} disabled={busyId === d.id} style={{ padding: "8px 16px", borderRadius: 10, border: "none", background: THEME.surfaceAlt, color: THEME.textSoft, fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>
                          🔎 Poner en revisión
                        </button>
                      )}
                      <button onClick={() => resolver(d.id, "RESOLVED_BUYER")} disabled={busyId === d.id} style={{ padding: "8px 16px", borderRadius: 10, border: "none", background: "#dcfce7", color: "#15803d", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>
                        ✅ A favor del comprador
                      </button>
                      <button onClick={() => resolver(d.id, "RESOLVED_SELLER")} disabled={busyId === d.id} style={{ padding: "8px 16px", borderRadius: 10, border: "none", background: "#dbeafe", color: THEME.primary, fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>
                        ✅ A favor del vendedor
                      </button>
                      <button onClick={() => resolver(d.id, "CANCELLED")} disabled={busyId === d.id} style={{ padding: "8px 16px", borderRadius: 10, border: "none", background: "#fee2e2", color: "#b91c1c", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>
                        ❌ Cancelar disputa
                      </button>
                    </div>
                  </>
                )}

                {d.adminNotes && d.status !== "OPEN" && d.status !== "UNDER_REVIEW" && (
                  <p style={{ fontSize: 12, color: THEME.muted, marginTop: 8, fontStyle: "italic" }}>Nota admin: {d.adminNotes}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
