// components/WompiPagoModal.tsx
"use client";
import { useState, useEffect } from "react";
import { THEME } from "@/lib/theme";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  productId: string;
  offerId: string;
  monto: number;
  nombreProducto: string;
  onPagoExitoso: () => void;
}

export default function WompiPagoModal({
  isOpen,
  onClose,
  productId,
  offerId,
  monto,
  nombreProducto,
  onPagoExitoso,
}: Props) {
  const [paso, setPaso] = useState<"metodo" | "nequi" | "procesando" | "exito" | "error">("metodo");
  const [telefono, setTelefono] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [mensajeError, setMensajeError] = useState("");
  const [polling, setPolling] = useState(false);

  // Resetear al abrir
  useEffect(() => {
    if (isOpen) {
      setPaso("metodo");
      setTelefono("");
      setTransactionId("");
      setMensajeError("");
    }
  }, [isOpen]);

  // Polling para verificar estado del pago
  useEffect(() => {
    if (!polling || !transactionId) return;

    const intervalo = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/pagos/estado?transactionId=${transactionId}&productId=${productId}`
        );
        const data = await res.json();

        if (data.aprobado) {
          setPolling(false);
          setPaso("exito");
          clearInterval(intervalo);
          setTimeout(() => onPagoExitoso(), 2000);
        } else if (data.rechazado) {
          setPolling(false);
          setPaso("error");
          setMensajeError("Pago rechazado. Verifica tu saldo en Nequi e intenta de nuevo.");
          clearInterval(intervalo);
        }
      } catch (e) {
        console.error("Error verificando pago:", e);
      }
    }, 3000); // Verificar cada 3 segundos

    // Timeout de 5 minutos
    const timeout = setTimeout(() => {
      setPolling(false);
      clearInterval(intervalo);
      setPaso("error");
      setMensajeError("Tiempo de espera agotado. Si pagaste, contacta soporte.");
    }, 300000);

    return () => {
      clearInterval(intervalo);
      clearTimeout(timeout);
    };
  }, [polling, transactionId, productId]);

  const iniciarPagoNequi = async () => {
    if (!telefono || telefono.length < 10) {
      setMensajeError("Ingresa un número de celular válido (10 dígitos)");
      return;
    }

    setPaso("procesando");
    setMensajeError("");

    try {
      const res = await fetch("/api/pagos/wompi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          offerId,
          phoneNumber: telefono,
          metodoPago: "NEQUI",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Error al procesar el pago");
      }

      setTransactionId(data.transactionId);
      setPolling(true);
    } catch (error: any) {
      setPaso("nequi");
      setMensajeError(error.message || "Error al iniciar el pago");
    }
  };

  if (!isOpen) return null;

  const estilos = {
    overlay: {
      position: "fixed" as const,
      inset: 0,
      backgroundColor: "rgba(0,0,0,0.7)",
      zIndex: 1000,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "1rem",
    },
    modal: {
      background: THEME.surfaceGradient,
      border: "1.5px solid transparent",
      borderRadius: "12px",
      padding: "2rem",
      maxWidth: "420px",
      width: "100%",
      color: THEME.text,
      boxShadow: THEME.cardShadow,
    },
    titulo: {
      fontSize: "1.3rem",
      fontWeight: "bold",
      color: THEME.gold,
      marginBottom: "0.5rem",
      width: "100%",
      textAlign: "center" as const,
    },
    monto: {
      fontSize: "1.8rem",
      fontWeight: "bold",
      color: THEME.primary,
      textAlign: "center" as const,
      margin: "1rem 0",
    },
    boton: {
      width: "100%",
      padding: "0.8rem",
      borderRadius: "8px",
      border: "none",
      cursor: "pointer",
      fontSize: "1rem",
      fontWeight: "bold",
      marginTop: "0.5rem",
    },
    input: {
      width: "100%",
      padding: "0.8rem",
      borderRadius: "8px",
      border: `1px solid ${THEME.border}`,
      backgroundColor: THEME.surfaceAlt,
      color: THEME.text,
      fontSize: "1rem",
      marginTop: "0.5rem",
      boxSizing: "border-box" as const,
    },
    error: {
      backgroundColor: "#fee2e2",
      color: "#b91c1c",
      padding: "0.5rem",
      borderRadius: "6px",
      marginTop: "0.5rem",
      fontSize: "0.9rem",
    },
  };

  return (
    <div style={estilos.overlay}>
      <div style={estilos.modal}>
        {/* Header */}
        <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={estilos.titulo}>💳 Pagar con Wompi</h2>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: THEME.muted, fontSize: "1.5rem", cursor: "pointer", position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)" }}
          >
            ✕
          </button>
        </div>

        <p style={{ color: THEME.muted, fontSize: "0.9rem" }}>{nombreProducto}</p>
        <div style={estilos.monto}>
          ${Number(monto).toLocaleString("es-CO")} COP
        </div>

        {/* PASO: Elegir método */}
        {paso === "metodo" && (
          <div>
            <p style={{ color: THEME.textSoft, marginBottom: "1rem", textAlign: "center" }}>
              Elige cómo quieres pagar:
            </p>
            <button
              style={{ ...estilos.boton, background: `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`, color: "white" }}
              onClick={() => setPaso("nequi")}
            >
              📱 Pagar con Nequi
            </button>
            <button
              style={{ ...estilos.boton, backgroundColor: THEME.surfaceAlt, color: THEME.muted, cursor: "not-allowed" }}
              disabled
            >
              🏦 PSE — Próximamente
            </button>
            <button
              style={{ ...estilos.boton, backgroundColor: THEME.surfaceAlt, color: THEME.muted, cursor: "not-allowed" }}
              disabled
            >
              💳 Tarjeta — Próximamente
            </button>
          </div>
        )}

        {/* PASO: Nequi */}
        {paso === "nequi" && (
          <div>
            <p style={{ color: THEME.textSoft, marginBottom: "0.5rem" }}>
              Ingresa tu número de celular registrado en Nequi:
            </p>
            <input
              style={estilos.input}
              type="tel"
              placeholder="3001234567"
              maxLength={10}
              value={telefono}
              onChange={(e) => setTelefono(e.target.value.replace(/\D/g, ""))}
            />
            {mensajeError && <div style={estilos.error}>{mensajeError}</div>}
            <button
              style={{ ...estilos.boton, background: `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`, color: "white" }}
              onClick={iniciarPagoNequi}
            >
              Enviar solicitud de pago
            </button>
            <button
              style={{ ...estilos.boton, backgroundColor: "transparent", color: THEME.muted, border: `1px solid ${THEME.border}` }}
              onClick={() => setPaso("metodo")}
            >
              ← Volver
            </button>
          </div>
        )}

        {/* PASO: Procesando */}
        {paso === "procesando" && (
          <div style={{ textAlign: "center", padding: "1rem 0" }}>
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📱</div>
            <p style={{ color: THEME.gold, fontWeight: "bold", fontSize: "1.1rem" }}>
              Revisa tu app de Nequi
            </p>
            <p style={{ color: THEME.muted, fontSize: "0.9rem", margin: "0.5rem 0" }}>
              Enviamos una solicitud de pago a tu celular. Apruébala en la app de Nequi.
            </p>
            <div style={{ color: THEME.primary, marginTop: "1rem" }}>
              ⏳ Verificando pago automáticamente...
            </div>
          </div>
        )}

        {/* PASO: Éxito */}
        {paso === "exito" && (
          <div style={{ textAlign: "center", padding: "1rem 0" }}>
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>✅</div>
            <p style={{ color: "#15803d", fontWeight: "bold", fontSize: "1.2rem" }}>
              ¡Pago exitoso!
            </p>
            <p style={{ color: THEME.muted, fontSize: "0.9rem" }}>
              Tu pago fue procesado. El vendedor recibirá el dinero cuando confirme la entrega.
            </p>
          </div>
        )}

        {/* PASO: Error */}
        {paso === "error" && (
          <div style={{ textAlign: "center", padding: "1rem 0" }}>
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>❌</div>
            <p style={{ color: "#b91c1c", fontWeight: "bold" }}>Pago no completado</p>
            <p style={{ color: THEME.muted, fontSize: "0.9rem", margin: "0.5rem 0" }}>
              {mensajeError}
            </p>
            <button
              style={{ ...estilos.boton, background: `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`, color: "white" }}
              onClick={() => { setPaso("nequi"); setMensajeError(""); }}
            >
              Intentar de nuevo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
