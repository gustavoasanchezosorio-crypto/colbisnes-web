"use client";

import { useEffect, useRef, useState } from "react";
import { THEME } from "@/lib/theme";

interface Props {
  endpoint: string;                 // "/api/checkout/nequi-online" | "/api/checkout/nequi-comision"
  body: Record<string, any>;        // { productoId, proteccionExtendida } | { orderId }
  montoLabel: string;               // monto formateado a mostrar
  prefillTelefono?: string | null;  // número Nequi del perfil, si existe
  onClose: () => void;
  // Se llama con el orderId cuando Wompi aprueba el pago. El padre decide a dónde ir.
  onApproved: (orderId: string) => void;
}

type Estado = "idle" | "pending" | "approved" | "declined" | "error";

export default function NequiPushModal({ endpoint, body, montoLabel, prefillTelefono, onClose, onApproved }: Props) {
  const [telefono, setTelefono] = useState((prefillTelefono || "").replace(/\D/g, "").slice(-10));
  const [estado, setEstado] = useState<Estado>("idle");
  const [error, setError] = useState("");
  const [iniciando, setIniciando] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const orderIdRef = useRef<string>("");

  const limpiar = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    pollRef.current = null;
    timeoutRef.current = null;
  };
  useEffect(() => () => limpiar(), []);

  const iniciar = async () => {
    setError("");
    if (telefono.length !== 10) { setError("Ingresa tu número Nequi de 10 dígitos"); return; }
    setIniciando(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...body, telefono }),
      });
      const data = await res.json().catch(() => ({}));

      // Guards de perfil: mandar al flujo que corresponda.
      if (data.kycRequired) { window.location.href = "/kyc"; return; }
      if (data.emailVerificationRequired) { window.location.href = "/auth/verify"; return; }
      if (data.antiPhishingRequired) { window.location.href = "/perfil/editar"; return; }
      if (data.payoutRequired) { window.location.href = "/perfil/editar?falta=pago"; return; }

      if (!res.ok || !data.ok) throw new Error(data.error || "No se pudo iniciar el cobro");

      orderIdRef.current = data.orderId || "";
      setEstado("pending");
      empezarPolling(data.transactionId);
    } catch (e: any) {
      setError(e.message || "No se pudo iniciar el cobro");
    } finally {
      setIniciando(false);
    }
  };

  const empezarPolling = (transactionId: string) => {
    limpiar();
    // Consulta el estado cada 3s hasta que Wompi apruebe/rechace o se agote el tiempo (5 min).
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/checkout/estado-transaccion?transactionId=" + encodeURIComponent(transactionId), { credentials: "include" });
        const data = await res.json().catch(() => ({}));
        const s = data.status;
        if (s === "APPROVED") {
          limpiar();
          setEstado("approved");
          setTimeout(() => onApproved(orderIdRef.current), 1200);
        } else if (s === "DECLINED" || s === "ERROR" || s === "VOIDED") {
          limpiar();
          setEstado("declined");
        }
      } catch { /* reintenta en el próximo tick */ }
    }, 3000);

    timeoutRef.current = setTimeout(() => {
      limpiar();
      setEstado((prev) => (prev === "pending" ? "error" : prev));
      setError("Se agotó el tiempo de espera. Si ya aprobaste en Nequi, revisa el estado de tu pedido; si no, intenta de nuevo.");
    }, 5 * 60 * 1000);
  };

  const cerrar = () => { limpiar(); onClose(); };

  return (
    <div onClick={cerrar} style={{ position: "fixed", inset: 0, zIndex: 2100, background: "rgba(10,22,40,0.5)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 24, padding: "26px 22px", maxWidth: 380, width: "100%", boxShadow: "0 20px 70px rgba(10,46,107,0.3)", textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: "#7e22ce" }}>Pagar con Nequi</span>
          <button onClick={cerrar} style={{ border: "none", background: "transparent", color: THEME.muted, fontSize: 20, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        {estado === "idle" && (
          <>
            <div style={{ fontSize: 44, marginBottom: 6 }}>💜</div>
            <p style={{ margin: "0 0 4px", fontSize: 14, color: THEME.textSoft }}>Vas a pagar</p>
            <p style={{ margin: "0 0 16px", fontSize: 24, fontWeight: 900, color: "#7e22ce" }}>{montoLabel}</p>
            <label style={{ display: "block", textAlign: "left", fontSize: 12, fontWeight: 700, color: THEME.muted, marginBottom: 6 }}>Tu número Nequi</label>
            <input
              value={telefono}
              onChange={(e) => setTelefono(e.target.value.replace(/\D/g, "").slice(0, 10))}
              inputMode="numeric"
              placeholder="3001234567"
              style={{ width: "100%", padding: "13px 14px", borderRadius: 13, border: `1.5px solid ${THEME.border}`, fontSize: 16, letterSpacing: 1, textAlign: "center", marginBottom: 14, boxSizing: "border-box" }}
            />
            {error && <p style={{ color: "#b91c1c", fontSize: 13, fontWeight: 600, margin: "0 0 12px" }}>⚠️ {error}</p>}
            <button onClick={iniciar} disabled={iniciando} style={{ width: "100%", padding: 15, borderRadius: 15, border: "none", background: iniciando ? "#e2e8f0" : "linear-gradient(135deg,#a855f7,#7e22ce)", color: "#fff", fontWeight: 800, fontSize: 15, cursor: iniciando ? "default" : "pointer" }}>
              {iniciando ? "Enviando..." : "Enviar solicitud a mi Nequi"}
            </button>
            <p style={{ margin: "10px 0 0", fontSize: 11.5, color: THEME.muted, lineHeight: 1.4 }}>
              Recibirás una notificación en tu app Nequi para aprobar el pago.
            </p>
          </>
        )}

        {estado === "pending" && (
          <div style={{ padding: "10px 0" }}>
            <div style={{ width: 46, height: 46, border: "4px solid #eee", borderTopColor: "#7e22ce", borderRadius: "50%", margin: "0 auto 16px", animation: "spin 0.8s linear infinite" }} />
            <p style={{ margin: "0 0 6px", fontWeight: 800, fontSize: 16, color: THEME.text }}>Revisa tu app Nequi</p>
            <p style={{ margin: 0, fontSize: 13, color: THEME.muted, lineHeight: 1.5 }}>Te enviamos una solicitud de pago por {montoLabel}. Ábrela y aprueba desde tu celular. No cierres esta ventana.</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {estado === "approved" && (
          <div style={{ padding: "10px 0" }}>
            <div style={{ fontSize: 48, marginBottom: 10 }}>✅</div>
            <p style={{ margin: 0, fontWeight: 800, fontSize: 17, color: "#15803d" }}>¡Pago aprobado!</p>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: THEME.muted }}>Un momento…</p>
          </div>
        )}

        {(estado === "declined" || estado === "error") && (
          <div style={{ padding: "10px 0" }}>
            <div style={{ fontSize: 46, marginBottom: 10 }}>{estado === "declined" ? "❌" : "⏱️"}</div>
            <p style={{ margin: "0 0 6px", fontWeight: 800, fontSize: 16, color: THEME.text }}>{estado === "declined" ? "El pago no se completó" : "Sin respuesta"}</p>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: THEME.muted, lineHeight: 1.5 }}>{error || "La solicitud fue rechazada o cancelada en Nequi. Puedes intentarlo de nuevo."}</p>
            <button onClick={() => { setEstado("idle"); setError(""); }} style={{ width: "100%", padding: 13, borderRadius: 14, border: "none", background: "linear-gradient(135deg,#a855f7,#7e22ce)", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
              Intentar de nuevo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
