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

  // Comprime/reescala la foto en el navegador antes de subirla. Las fotos de
  // celular pesan 3-8 MB; subir eso por una red móvil lenta era lo que dejaba
  // "Registrando..." congelado. La reducimos a máx 1600px y JPEG ~0.7 (típico
  // 200-500 KB) para que la subida sea de segundos. Si algo falla, se sube el
  // archivo original sin romper el flujo.
  const comprimirImagen = (file: File): Promise<Blob> =>
    new Promise((resolve) => {
      if (!file.type.startsWith("image/")) { resolve(file); return; }
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX = 1600;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width >= height) { height = Math.round(height * (MAX / width)); width = MAX; }
          else { width = Math.round(width * (MAX / height)); height = MAX; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(file); return; }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => resolve(blob || file), "image/jpeg", 0.7);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });

  const handleSubmit = async () => {
    if (enviando) return; // guarda anti doble-envío
    setError("");
    if (!numeroGuia.trim()) { setError("Ingresa el numero de guia"); return; }
    const validacion = validarNumeroGuia(transportadora, numeroGuia.trim());
    if (!validacion.valido) { setError(validacion.motivo || "Número de guía inválido"); return; }
    if (!comprobante) { setError("Sube una foto de la guía o el comprobante de envío — es obligatorio para proteger al comprador"); return; }
    setEnviando(true);

    // Timeout duro: si el servidor no responde en 60s, abortamos para no dejar
    // el botón "Registrando..." congelado para siempre (bug reportado en pruebas).
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);
    try {
      const imagen = await comprimirImagen(comprobante);

      const fd = new FormData();
      fd.append("orderId", orderId);
      fd.append("numeroGuia", numeroGuia.trim());
      fd.append("transportadora", transportadora);
      fd.append("comprobante", imagen, "comprobante.jpg");

      const res = await fetch("/api/orders/marcar-enviado", { method: "POST", credentials: "include", body: fd, signal: controller.signal });
      const text = await res.text();
      let data: any = {};
      try { data = JSON.parse(text); } catch { data = { error: "Respuesta invalida (" + res.status + ")" }; }
      if (!res.ok) throw new Error(data.error || "Error al registrar el envio");

      onSuccess();
      onClose();
    } catch (e: any) {
      if (e.name === "AbortError") {
        // Puede que el servidor sí lo haya guardado aunque la respuesta no llegó.
        setError("La conexión tardó demasiado. Si ya subiste la guía, recarga la página para verificar antes de reintentar.");
      } else {
        setError(e.message || "Error al registrar el envio");
      }
    } finally {
      clearTimeout(timeoutId);
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
