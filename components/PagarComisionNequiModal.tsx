"use client";

import { useState } from "react";
import { THEME } from "@/lib/theme";
import NequiPushModal from "@/components/NequiPushModal";

interface Props {
  orderId: string;
  comisionCOP: number;
  nequiNumero: string | null;
  fechaLimiteEnvio?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function PagarComisionNequiModal({ orderId, comisionCOP, nequiNumero, fechaLimiteEnvio, onClose, onSuccess }: Props) {
  const [referencia, setReferencia] = useState("");
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [showNequiPush, setShowNequiPush] = useState(false);

  const fmt = (n: number) => "$" + n.toLocaleString("es-CO", { maximumFractionDigits: 0 });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setComprobante(file);
      setPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async () => {
    setError("");
    if (referencia.trim().length < 3) { setError("Ingresa el número de referencia de la transferencia"); return; }
    if (!comprobante) { setError("Sube una foto o captura del comprobante de la transferencia Nequi"); return; }
    setEnviando(true);
    try {
      const fd = new FormData();
      fd.append("orderId", orderId);
      fd.append("referencia", referencia.trim());
      fd.append("comprobante", comprobante);

      const res = await fetch("/api/checkout/confirmar-comision-nequi", { method: "POST", credentials: "include", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Error al enviar el comprobante");

      setEnviado(true);
      onSuccess();
    } catch (e: any) {
      setError(e.message || "Error al enviar el comprobante");
    } finally {
      setEnviando(false);
    }
  };

  if (showNequiPush) {
    return (
      <NequiPushModal
        endpoint="/api/checkout/nequi-comision"
        body={{ orderId }}
        montoLabel={fmt(comisionCOP)}
        onClose={() => setShowNequiPush(false)}
        onApproved={() => { onSuccess(); onClose(); }}
      />
    );
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(10,22,40,0.5)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: THEME.surfaceGradient, backdropFilter: "blur(20px)", borderRadius: 26, padding: "28px 24px", maxWidth: 420, width: "100%", boxShadow: THEME.cardShadow, border: "1.5px solid transparent", maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h2 style={{ color: THEME.text, fontWeight: 800, fontSize: 19, margin: 0, width: "100%", textAlign: "center" }}>💜 Pagar comisión de reserva</h2>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: "50%", border: "none", background: THEME.surfaceAlt, color: THEME.textSoft, fontSize: 16, cursor: "pointer", position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)" }}>×</button>
        </div>

        {enviado ? (
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
            <p style={{ color: THEME.text, fontWeight: 700, fontSize: 15, margin: "0 0 6px" }}>Comprobante recibido</p>
            <p style={{ color: THEME.muted, fontSize: 13, lineHeight: 1.5 }}>Un administrador verificará tu pago y habilitará el envío del vendedor en breve. Te avisaremos.</p>
            <button onClick={onClose} style={{ marginTop: 16, width: "100%", padding: 14, borderRadius: 14, border: "none", background: THEME.primary, color: "#fff", fontWeight: 700, cursor: "pointer" }}>Entendido</button>
          </div>
        ) : (
          <>
            <div style={{ background: THEME.surfaceAlt, borderRadius: 14, padding: "14px 16px", marginBottom: 16, border: `1px solid ${THEME.border}` }}>
              <p style={{ margin: "0 0 8px", fontSize: 13, color: THEME.textSoft, lineHeight: 1.5 }}>
                Para reservar el producto y garantizar tu compra contra entrega, primero debes transferir por <strong>Nequi</strong> la comisión de Colbisnes:
              </p>
              <p style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 900, color: THEME.primary, textAlign: "center" }}>{fmt(comisionCOP)}</p>
              {nequiNumero ? (
                <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: THEME.text, textAlign: "center", fontFamily: "monospace", letterSpacing: 1 }}>{nequiNumero}</p>
              ) : (
                <p style={{ margin: 0, fontSize: 12.5, color: "#b91c1c", textAlign: "center", fontWeight: 600 }}>⚠️ El número Nequi de Colbisnes aún no está configurado. Contacta a soporte antes de transferir.</p>
              )}
            </div>

            {/* Botón exclusivo de Nequi: notificación push directa a la app del comprador. Confirma
                solo, sin esperar al admin. Como respaldo queda la transferencia manual de abajo. */}
            <button
              onClick={() => setShowNequiPush(true)}
              style={{ width: "100%", padding: 15, borderRadius: 16, border: "none", background: "linear-gradient(135deg,#a855f7,#7e22ce)", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", boxShadow: "0 8px 24px rgba(126,34,206,0.35)", marginBottom: 8 }}
            >
              💜 Pagar con Nequi (sin salir de la app)
            </button>
            <p style={{ margin: "0 0 16px", fontSize: 11.5, color: THEME.muted, textAlign: "center", lineHeight: 1.4 }}>
              Te llega una solicitud a tu app Nequi para aprobar. Se confirma al instante y reserva tu producto automáticamente.
            </p>

            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 16px" }}>
              <div style={{ flex: 1, height: 1, background: THEME.border }} />
              <span style={{ fontSize: 11, color: THEME.muted, fontWeight: 700 }}>o transfiere manualmente</span>
              <div style={{ flex: 1, height: 1, background: THEME.border }} />
            </div>

            <div style={{ background: "rgba(126,34,206,0.06)", border: "1px solid rgba(126,34,206,0.25)", borderRadius: 14, padding: "12px 14px", marginBottom: 16 }}>
              <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 800, color: "#7e22ce", textTransform: "uppercase", letterSpacing: "0.04em" }}>📋 Condiciones de esta compra</p>
              <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
                <li style={{ fontSize: 12, color: THEME.textSoft, lineHeight: 1.45 }}>Esta comisión es una <strong>garantía de reserva</strong> — no es el pago del producto. El producto lo pagas en efectivo, directamente al mensajero, al recibirlo.</li>
                <li style={{ fontSize: 12, color: THEME.textSoft, lineHeight: 1.45 }}>Un administrador de Colbisnes confirma manualmente cada pago revisando tu comprobante — no es instantáneo, puede tardar un poco.</li>
                <li style={{ fontSize: 12, color: THEME.textSoft, lineHeight: 1.45 }}>
                  El vendedor tiene <strong>24 horas hábiles (8am–8pm)</strong> desde que se creó tu orden para despachar el producto{fechaLimiteEnvio ? <> — <strong>vence el {new Date(fechaLimiteEnvio).toLocaleString("es-CO")}</strong></> : null}. Ese plazo corre aunque tu pago esté pendiente de confirmar, así que conviene pagar y subir tu comprobante cuanto antes.
                </li>
                <li style={{ fontSize: 12, color: "#b45309", lineHeight: 1.45, fontWeight: 600 }}>Si el vendedor no despacha a tiempo: se le bloquea la cuenta para comprar y vender, baja su puntaje de confianza a la mitad, y Colbisnes gestionará contigo la devolución de tu comisión.</li>
              </ul>
            </div>

            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: THEME.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Número de referencia de la transferencia *</label>
            <input value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="Ej: M12345678" style={{ width: "100%", padding: "12px 14px", borderRadius: 14, border: `1.5px solid ${THEME.border}`, background: THEME.surfaceAlt, color: THEME.text, fontSize: 14, marginBottom: 16, boxSizing: "border-box" }} />

            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: THEME.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Captura del comprobante *</label>
            <input type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} id="comprobante-comision-input" />
            <label htmlFor="comprobante-comision-input" style={{ display: "block", border: `2px dashed ${THEME.border}`, borderRadius: 14, padding: preview ? 0 : "24px 14px", textAlign: "center", cursor: "pointer", marginBottom: 16, overflow: "hidden", background: THEME.surfaceAlt }}>
              {preview ? (
                <img src={preview} alt="comprobante" style={{ width: "100%", maxHeight: 180, objectFit: "cover", display: "block" }} />
              ) : (
                <span style={{ color: THEME.primary, fontSize: 13, fontWeight: 600 }}>📷 Toca para subir la captura de la transferencia</span>
              )}
            </label>

            {error && <div style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.4)", color: "#b91c1c", padding: "10px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600, marginBottom: 14 }}>⚠️ {error}</div>}

            <button onClick={handleSubmit} disabled={enviando} style={{ width: "100%", padding: 15, borderRadius: 16, border: "none", background: enviando ? "#e2e8f0" : `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`, color: "#fff", fontWeight: 800, fontSize: 15, cursor: enviando ? "default" : "pointer", boxShadow: enviando ? "none" : "0 8px 24px rgba(14,86,192,0.35)" }}>
              {enviando ? "Enviando..." : "Ya pagué, enviar comprobante"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
