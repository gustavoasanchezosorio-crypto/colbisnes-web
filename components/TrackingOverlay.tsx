"use client";

import { useEffect, useState } from "react";

const MOTIVOS_DISPUTA = [
  { id: "NO_ENVIADO", label: "El vendedor no ha enviado el producto" },
  { id: "NO_RECIBIDO", label: "Marcaron entregado pero nunca lo recibí" },
  { id: "PRODUCTO_DIFERENTE", label: "El producto no coincide con lo anunciado" },
  { id: "PRODUCTO_DAÑADO", label: "Llegó dañado o incompleto" },
  { id: "OTRO", label: "Otro problema" },
];

const PASOS_ONLINE = [
  { id: "PAGADO", icon: "💳", titulo: "Pago confirmado", desc: "Tu pago fue procesado y confirmado por Colbisnes" },
  { id: "ESPERANDO_ENVIO", icon: "📦", titulo: "Vendedor preparando", desc: "El vendedor esta empacando tu producto" },
  { id: "EN_CAMINO", icon: "🚚", titulo: "En camino", desc: "Tu pedido va en camino" },
  { id: "ENTREGADO", icon: "✅", titulo: "Entregado", desc: "Confirma que recibiste tu producto" },
  { id: "COMPLETADO", icon: "⭐", titulo: "Compra completada", desc: "Pago liberado. Califica tu experiencia" },
];

const PASOS_CONTRA_ENTREGA = [
  { id: "PAGADO", icon: "🤝", titulo: "Pedido confirmado", desc: "Tu pedido fue confirmado. Pagarás en efectivo al recibir" },
  { id: "ESPERANDO_ENVIO", icon: "📦", titulo: "Vendedor preparando", desc: "El vendedor esta empacando tu producto" },
  { id: "EN_CAMINO", icon: "🚚", titulo: "En camino", desc: "Tu pedido va en camino" },
  { id: "ENTREGADO", icon: "✅", titulo: "Entregado — Pagar ahora", desc: "Entrega el efectivo al mensajero y confirma recibo" },
  { id: "COMPLETADO", icon: "⭐", titulo: "Compra completada", desc: "Pago recibido. Califica tu experiencia" },
];

function indiceDeEstado(estado: string): number {
  return PASOS_ONLINE.findIndex(p => p.id === estado);
}

interface Props {
  orderId: string;
  productTitle: string;
  onClose: () => void;
}

export default function TrackingOverlay({ orderId, productTitle, onClose }: Props) {
  const [estado, setEstado] = useState<string>("VERIFICANDO");
  const [monto, setMonto] = useState<number | null>(null);
  const [numeroGuia, setNumeroGuia] = useState<string | null>(null);
  const [transportadora, setTransportadora] = useState<string | null>(null);
  const [comprobanteUrl, setComprobanteUrl] = useState<string | null>(null);
  const [metodoPago, setMetodoPago] = useState<string | null>(null);

  const [mostrarDisputa, setMostrarDisputa] = useState(false);
  const [motivoDisputa, setMotivoDisputa] = useState(MOTIVOS_DISPUTA[0].id);
  const [detalleDisputa, setDetalleDisputa] = useState("");
  const [evidenciaFiles, setEvidenciaFiles] = useState<File[]>([]);
  const [enviandoDisputa, setEnviandoDisputa] = useState(false);
  const [disputaMsg, setDisputaMsg] = useState("");

  const enviarDisputa = async () => {
    setEnviandoDisputa(true);
    setDisputaMsg("");
    try {
      const urls: string[] = [];
      for (const file of evidenciaFiles) {
        const fd = new FormData();
        fd.append("image", file);
        const res = await fetch("/api/upload", { method: "POST", credentials: "include", body: fd });
        const data = await res.json();
        if (res.ok && data.url) urls.push(data.url);
      }
      const res = await fetch("/api/disputes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ orderId, reason: motivoDisputa, detalle: detalleDisputa, evidence: urls }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo enviar el reporte");
      setDisputaMsg("✅ Reporte enviado. Nuestro equipo lo revisará y te contactará.");
      setDetalleDisputa("");
      setEvidenciaFiles([]);
    } catch (e: any) {
      setDisputaMsg("❌ " + e.message);
    } finally {
      setEnviandoDisputa(false);
    }
  };

  useEffect(() => {
    const verificar = () => {
      fetch("/api/checkout/estado?orderId=" + orderId)
        .then(r => r.json())
        .then(d => {
          if (d.estado) setEstado(d.estado);
          if (d.totalPagado) setMonto(d.totalPagado);
          if (d.numeroGuia) setNumeroGuia(d.numeroGuia);
          if (d.transportadora) setTransportadora(d.transportadora);
          if (d.comprobanteUrl) setComprobanteUrl(d.comprobanteUrl);
          if (d.metodoPago) setMetodoPago(d.metodoPago);
        })
        .catch(() => {});
    };
    verificar();
    const interval = setInterval(verificar, 4000);
    return () => clearInterval(interval);
  }, [orderId]);

  const fmt = (n: number) => "$" + n.toLocaleString("es-CO");
  const esContraEntrega = metodoPago === "CONTRA_ENTREGA";
  const PASOS = esContraEntrega ? PASOS_CONTRA_ENTREGA : PASOS_ONLINE;
  const indiceActual = indiceDeEstado(estado);
  const enTracking = indiceActual >= 0;
  const esFallido = estado === "RECHAZADO" || estado === "ANULADO" || estado === "ERROR";
  const yaEnviado = indiceActual >= 2;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1500,
        background: "rgba(10,22,40,0.45)",
        backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
        animation: "fadeInBg 0.25s ease",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 480,
          background: "rgba(255,255,255,0.82)",
          backdropFilter: "blur(28px) saturate(1.8)",
          WebkitBackdropFilter: "blur(28px) saturate(1.8)",
          borderRadius: "28px",
          padding: "10px 20px 28px",
          boxShadow: "0 -20px 60px rgba(31,107,255,0.25)",
          maxHeight: "85vh", overflowY: "auto",
          animation: "slideUp 0.35s cubic-bezier(0.32,0.72,0,1)",
          border: "1px solid rgba(255,255,255,0.6)",
        }}
      >
        <div style={{ width: 40, height: 5, background: "rgba(0,0,0,0.15)", borderRadius: 10, margin: "6px auto 18px" }} />

        <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
          <div style={{ width: "100%" }}>
            <h2 style={{ color: "#0a1628", fontWeight: 800, fontSize: 19, margin: 0, textAlign: "center" }}>Tu pedido</h2>
            <p style={{ color: "#64748b", fontSize: 12, margin: "2px 0 0" }}>
              <span style={{ color: "#1F6BFF", fontWeight: 700 }}>Colbisnes</span> — {productTitle}
            </p>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.06)", color: "#475569", fontSize: 16, cursor: "pointer", flexShrink: 0, position: "absolute", right: 0, top: 0 }}>×</button>
        </div>

        {estado === "VERIFICANDO" && (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <div style={{ width: 44, height: 44, border: "3px solid rgba(31,107,255,0.2)", borderTopColor: "#1F6BFF", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
            <p style={{ color: "#64748b", fontSize: 14 }}>Verificando tu pago...</p>
          </div>
        )}

        {esFallido && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>❌</div>
            <p style={{ color: "#ef4444", fontWeight: 700 }}>Pago no completado</p>
            <p style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>Intenta de nuevo o contacta soporte.</p>
          </div>
        )}

        {enTracking && (
          <>
            {monto && (
              <div style={{ background: esContraEntrega ? "rgba(245,158,11,0.08)" : "rgba(31,107,255,0.08)", border: `1px solid ${esContraEntrega ? "rgba(245,158,11,0.25)" : "rgba(31,107,255,0.15)"}`, borderRadius: 14, padding: "10px 14px", marginBottom: 16, textAlign: "center" }}>
                <span style={{ color: esContraEntrega ? "#d97706" : "#1F6BFF", fontWeight: 800, fontSize: 16 }}>{fmt(monto)} COP</span>
                <span style={{ color: "#64748b", fontSize: 12, marginLeft: 6 }}>{esContraEntrega ? "contra entrega 🤝" : "pagado"}</span>
              </div>
            )}

            {yaEnviado && numeroGuia && (
              <div style={{ background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 16, padding: "14px 16px", marginBottom: 16 }}>
                <p style={{ color: "#16a34a", fontWeight: 800, fontSize: 13, margin: "0 0 8px" }}>🚚 Informacion de envio</p>
                {transportadora && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                    <span style={{ color: "#64748b" }}>Transportadora</span>
                    <span style={{ color: "#0a1628", fontWeight: 700 }}>{transportadora}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: comprobanteUrl ? 10 : 0 }}>
                  <span style={{ color: "#64748b" }}>Numero de guia</span>
                  <span style={{ color: "#0a1628", fontWeight: 700 }}>{numeroGuia}</span>
                </div>
                {comprobanteUrl && (
                  <img src={comprobanteUrl} alt="Comprobante de envio" style={{ width: "100%", borderRadius: 12, maxHeight: 160, objectFit: "cover", marginTop: 4 }} />
                )}
              </div>
            )}

            <div style={{ marginTop: 4 }}>
              {PASOS.map((p, i) => {
                const completado = i < indiceActual;
                const enCurso = i === indiceActual;
                const pendiente = i > indiceActual;
                return (
                  <div key={p.id} style={{ display: "flex", gap: 14 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <div style={{
                        width: 38, height: 38, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0,
                        background: completado ? "linear-gradient(135deg,#22c55e,#16a34a)" : enCurso ? "linear-gradient(135deg,#2fa4dc,#0e56c0)" : "rgba(0,0,0,0.05)",
                        boxShadow: enCurso ? "0 0 0 5px rgba(31,107,255,0.15)" : "none",
                        transition: "all 0.3s",
                      }}>
                        {completado ? "✓" : p.icon}
                      </div>
                      {i < PASOS.length - 1 && (
                        <div style={{ width: 2, flex: 1, minHeight: 32, background: completado ? "#22c55e" : "rgba(0,0,0,0.08)", margin: "3px 0" }} />
                      )}
                    </div>
                    <div style={{ paddingBottom: 22, flex: 1 }}>
                      <p style={{ fontWeight: 700, fontSize: 13.5, margin: 0, color: pendiente ? "#94a3b8" : "#0a1628" }}>{p.titulo}</p>
                      <p style={{ fontSize: 11.5, margin: "3px 0 0", color: pendiente ? "#cbd5e1" : "#64748b", lineHeight: 1.45 }}>{p.desc}</p>
                      {enCurso && <span style={{ display: "inline-block", marginTop: 6, fontSize: 9.5, fontWeight: 800, color: "#0e56c0", background: "rgba(14,86,192,0.1)", padding: "2px 9px", borderRadius: 20 }}>EN CURSO</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {(enTracking || esFallido) && (
          <div style={{ marginTop: 10, paddingTop: 14, borderTop: "1px solid rgba(0,0,0,0.08)" }}>
            {!mostrarDisputa ? (
              <button onClick={() => setMostrarDisputa(true)} style={{ width: "100%", padding: "10px", borderRadius: 12, border: "1.5px solid #fecaca", background: "#fee2e2", color: "#b91c1c", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>
                ⚠️ Reportar un problema con este pedido
              </button>
            ) : (
              <div>
                <p style={{ fontWeight: 800, fontSize: 13, color: "#0a1628", margin: "0 0 8px" }}>Reportar un problema</p>
                <select value={motivoDisputa} onChange={e => setMotivoDisputa(e.target.value)} style={{ width: "100%", padding: "9px 10px", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12.5, marginBottom: 8, background: "#fff", color: "#0a1628" }}>
                  {MOTIVOS_DISPUTA.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
                <textarea
                  placeholder="Cuéntanos qué pasó (opcional)"
                  value={detalleDisputa}
                  onChange={e => setDetalleDisputa(e.target.value)}
                  rows={2}
                  style={{ width: "100%", padding: "9px 10px", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12.5, marginBottom: 8, boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }}
                />
                <input type="file" accept="image/*" multiple onChange={e => setEvidenciaFiles(Array.from(e.target.files || []).slice(0, 4))} style={{ fontSize: 11.5, marginBottom: 10 }} />
                {disputaMsg && <p style={{ fontSize: 12, fontWeight: 600, color: disputaMsg.startsWith("✅") ? "#15803d" : "#b91c1c", margin: "0 0 8px" }}>{disputaMsg}</p>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={enviarDisputa} disabled={enviandoDisputa} style={{ flex: 1, padding: "10px", borderRadius: 12, border: "none", background: "#b91c1c", color: "#fff", fontWeight: 700, fontSize: 12.5, cursor: enviandoDisputa ? "default" : "pointer" }}>
                    {enviandoDisputa ? "Enviando..." : "Enviar reporte"}
                  </button>
                  <button onClick={() => setMostrarDisputa(false)} style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid #e2e8f0", background: "transparent", color: "#64748b", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin      { to { transform: rotate(360deg); } }
        @keyframes slideUp   { from { transform: translateY(40px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes fadeInBg  { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
}
