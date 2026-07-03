"use client";

import { useState } from "react";
import { THEME } from "@/lib/theme";
import { validarNumeroGuia } from "@/lib/shippingValidation";

interface Props {
  orderId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const TRANSPORTADORAS = ["Servientrega", "Coordinadora", "Interrapidisimo", "TCC", "Envia", "La Ultima Milla", "Otra"];

export default function MarcarEnviadoModal({ orderId, onClose, onSuccess }: Props) {
  const [numeroGuia, setNumeroGuia] = useState("");
  const [transportadora, setTransportadora] = useState("Servientrega");
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setComprobante(file);
      setPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async () => {
    setError("");
    if (!numeroGuia.trim()) { setError("Ingresa el numero de guia"); return; }
    const validacion = validarNumeroGuia(transportadora, numeroGuia.trim());
    if (!validacion.valido) { setError(validacion.motivo || "Número de guía inválido"); return; }
    if (!comprobante) { setError("Sube una foto de la guía o el comprobante de envío — es obligatorio para proteger al comprador"); return; }
    setEnviando(true);
    try {
      const fd = new FormData();
      fd.append("orderId", orderId);
      fd.append("numeroGuia", numeroGuia.trim());
      fd.append("transportadora", transportadora);
      if (comprobante) fd.append("comprobante", comprobante);

      const res = await fetch("/api/orders/marcar-enviado", { method: "POST", credentials: "include", body: fd });
      const text = await res.text();
      let data: any = {};
      try { data = JSON.parse(text); } catch { data = { error: "Respuesta invalida (" + res.status + ")" }; }
      if (!res.ok) throw new Error(data.error || "Error al registrar el envio");

      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e.message || "Error al registrar el envio");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(10,22,40,0.5)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: THEME.surfaceGradient, backdropFilter: "blur(20px)", borderRadius: 26, padding: "28px 24px", maxWidth: 420, width: "100%", boxShadow: THEME.cardShadow, border: "1.5px solid transparent", maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h2 style={{ color: THEME.text, fontWeight: 800, fontSize: 19, margin: 0, width: "100%", textAlign: "center" }}>📦 Registrar envio</h2>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: "50%", border: "none", background: THEME.surfaceAlt, color: THEME.textSoft, fontSize: 16, cursor: "pointer", position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)" }}>×</button>
        </div>

        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: THEME.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Transportadora</label>
        <select value={transportadora} onChange={e => setTransportadora(e.target.value)} style={{ width: "100%", padding: "12px 14px", borderRadius: 14, border: `1.5px solid ${THEME.border}`, fontSize: 14, marginBottom: 16, background: THEME.surface, color: THEME.text }}>
          {TRANSPORTADORAS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: THEME.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Numero de guia *</label>
        <input value={numeroGuia} onChange={e => setNumeroGuia(e.target.value)} placeholder="Ej: 123456789" style={{ width: "100%", padding: "12px 14px", borderRadius: 14, border: `1.5px solid ${THEME.border}`, background: THEME.surfaceAlt, color: THEME.text, fontSize: 14, marginBottom: 16, boxSizing: "border-box" }} />

        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: THEME.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Foto del soporte *</label>
        <input type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} id="comprobante-input" />
        <label htmlFor="comprobante-input" style={{ display: "block", border: `2px dashed ${THEME.border}`, borderRadius: 14, padding: preview ? 0 : "24px 14px", textAlign: "center", cursor: "pointer", marginBottom: 16, overflow: "hidden", background: THEME.surfaceAlt }}>
          {preview ? (
            <img src={preview} alt="comprobante" style={{ width: "100%", maxHeight: 180, objectFit: "cover", display: "block" }} />
          ) : (
            <span style={{ color: THEME.primary, fontSize: 13, fontWeight: 600 }}>📷 Toca para subir la foto de la guia</span>
          )}
        </label>

        {error && <div style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.4)", color: "#b91c1c", padding: "10px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600, marginBottom: 14 }}>⚠️ {error}</div>}

        <button onClick={handleSubmit} disabled={enviando} style={{ width: "100%", padding: 15, borderRadius: 16, border: "none", background: enviando ? "#e2e8f0" : `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`, color: "#fff", fontWeight: 800, fontSize: 15, cursor: enviando ? "default" : "pointer", boxShadow: enviando ? "none" : "0 8px 24px rgba(14,86,192,0.35)" }}>
          {enviando ? "Registrando..." : "Confirmar envio"}
        </button>
      </div>
    </div>
  );
}
