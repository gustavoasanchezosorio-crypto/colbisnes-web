"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { THEME } from "@/lib/theme";

export default function USDTPagoContent() {
  const params  = useSearchParams();
  const router  = useRouter();
  const orderId = params.get("orderId");
  const total   = params.get("total");
  // La wallet de la URL es solo un valor inicial de respaldo (puede quedar
  // desactualizada si el link de checkout es viejo). En cuanto el backend
  // responde, siempre se usa la wallet vigente en el servidor.
  const [wallet, setWallet] = useState(params.get("wallet") || "");
  const [copiado, setCopiado] = useState(false);
  const [estado, setEstado] = useState<"esperando" | "verificando" | "pagado">("esperando");
  // Fecha límite real de pago (viene del servidor), y "ahora" que avanza cada segundo
  // para pintar el contador hacia atrás. Antes solo había un texto fijo "10 minutos"
  // que nunca contaba — el comprador no veía cuánto tiempo le quedaba realmente.
  const [expiraEn, setExpiraEn] = useState<number | null>(null);
  const [ahora, setAhora] = useState<number>(Date.now());

  useEffect(() => {
    if (!orderId) return;
    const verificar = async () => {
      try {
        const res = await fetch("/api/usdt/verificar?orderId=" + orderId);
        const data = await res.json();
        if (data.wallet) setWallet(data.wallet);
        if (data.paymentExpiresAt) setExpiraEn(new Date(data.paymentExpiresAt).getTime());
        if (data.estado === "PAGADO") {
          setEstado("pagado");
          setTimeout(() => router.push("/?tracking=" + orderId), 2000);
        }
      } catch {}
    };
    const interval = setInterval(verificar, 6000);
    verificar();
    return () => clearInterval(interval);
  }, [orderId, router]);

  // Reloj local que avanza cada segundo para redibujar el contador.
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const msRestantes = expiraEn !== null ? expiraEn - ahora : null;
  const expirado = msRestantes !== null && msRestantes <= 0 && estado !== "pagado";
  const mmss = (() => {
    if (msRestantes === null || msRestantes <= 0) return "00:00";
    const s = Math.floor(msRestantes / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  })();

  // Dirección completa visible, resaltando en azul Colbisnes los primeros 6 y
  // los últimos 6 caracteres (sin contar el prefijo "0x"), igual que Binance.
  const walletInicio = wallet.slice(0, 8);   // "0x" + primeros 6
  const walletMedio   = wallet.length > 14 ? wallet.slice(8, -6) : "";
  const walletFin      = wallet.length > 14 ? wallet.slice(-6) : "";

  const copiar = () => {
    navigator.clipboard.writeText(wallet);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const btnExchange = (color: string) => ({
    display: "block", width: "100%", textAlign: "center" as const, padding: "13px",
    borderRadius: 14, fontWeight: 800, fontSize: 14, textDecoration: "none",
    color: "#fff", background: color, marginBottom: 8,
  });

  if (estado === "pagado") {
    return (
      <div style={{ minHeight: "100vh", background: THEME.background, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "-apple-system,sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 80, height: 80, background: "linear-gradient(135deg,#22c55e,#16a34a)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 40, boxShadow: "0 10px 30px rgba(34,197,94,0.4)" }}>✓</div>
          <h2 style={{ color: THEME.text, fontWeight: 900, fontSize: 22 }}>Pago detectado</h2>
          <p style={{ color: THEME.muted, fontSize: 14 }}>Redirigiendo a tu pedido...</p>
        </div>
      </div>
    );
  }

  if (expirado) {
    return (
      <div style={{ minHeight: "100vh", background: THEME.background, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "-apple-system,sans-serif", padding: "24px" }}>
        <div style={{ textAlign: "center", maxWidth: 380 }}>
          <div style={{ width: 80, height: 80, background: "linear-gradient(135deg,#ef4444,#b91c1c)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 38, boxShadow: "0 10px 30px rgba(239,68,68,0.4)" }}>⏰</div>
          <h2 style={{ color: THEME.text, fontWeight: 900, fontSize: 22, margin: "0 0 8px" }}>Se acabó el tiempo</h2>
          <p style={{ color: THEME.muted, fontSize: 14, lineHeight: 1.5, margin: "0 0 20px" }}>Pasaron los 10 minutos para completar el pago. El producto quedó disponible de nuevo. Si aún lo quieres, debes hacer una nueva oferta.</p>
          <button onClick={() => router.push("/")} style={{ padding: "12px 22px", borderRadius: 14, border: "none", background: `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`, color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>Volver al inicio</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: THEME.background, fontFamily: "-apple-system,sans-serif", padding: "24px 16px 60px" }}>
      <div style={{ maxWidth: 460, margin: "0 auto" }}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 20 }}>
          <div style={{ width: 36, height: 36, background: `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, boxShadow: `0 4px 16px ${THEME.primary}44` }}>🪙</div>
          <h1 style={{ color: THEME.text, fontWeight: 800, fontSize: 20, margin: 0 }}>Pago con USDT</h1>
        </div>
        <p style={{ color: THEME.muted, fontSize: 12, marginBottom: 20 }}>Orden #{orderId}</p>

        <div style={{ background: THEME.surfaceGradient, backdropFilter: "blur(20px)", borderRadius: 24, padding: "22px 20px", boxShadow: THEME.cardShadow, border: "1.5px solid transparent" }}>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 14, background: THEME.surfaceAlt, borderRadius: 12, padding: "8px" }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: THEME.primary, animation: "pulso 1.4s ease-in-out infinite" }} />
            <span style={{ color: THEME.primary, fontSize: 12, fontWeight: 700 }}>Verificando pago automaticamente...</span>
          </div>

          <div style={{ textAlign: "center", marginBottom: 18 }}>
            <p style={{ color: THEME.muted, fontSize: 12, margin: "0 0 4px" }}>Monto exacto a transferir</p>
            <p style={{ color: THEME.primary, fontWeight: 900, fontSize: 32, margin: 0 }}>{total} USDT</p>
            <p style={{ color: THEME.muted, fontSize: 11, marginTop: 4 }}>Red: BNB Chain (BEP20)</p>
          </div>

          <div style={{ background: THEME.surfaceAlt, borderRadius: 14, padding: "12px 14px", marginBottom: 16 }}>
            <p style={{ color: THEME.muted, fontSize: 11, marginBottom: 6, fontWeight: 600 }}>Wallet destino</p>
            <p style={{ fontWeight: 700, fontSize: 13, fontFamily: "monospace", wordBreak: "break-all", letterSpacing: "0.2px", margin: "0 0 10px" }}>
              <span style={{ color: "#1F6BFF", fontWeight: 900 }}>{walletInicio}</span>
              <span style={{ color: THEME.text }}>{walletMedio}</span>
              <span style={{ color: "#1F6BFF", fontWeight: 900 }}>{walletFin}</span>
            </p>
            <button onClick={copiar} style={{ width: "100%", padding: "9px", borderRadius: 10, border: "none", background: copiado ? "#22c55e" : THEME.primary, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              {copiado ? "✓ Copiado" : "Copiar wallet"}
            </button>
          </div>

          <div style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 14, padding: "12px 14px", marginBottom: 16 }}>
            <p style={{ color: "#b91c1c", fontWeight: 700, fontSize: 12, margin: "0 0 6px" }}>⚠️ Importante</p>
            <p style={{ color: "#b91c1c", fontSize: 11.5, margin: "2px 0", lineHeight: 1.5 }}>Envia EXACTAMENTE {total} USDT</p>
            <p style={{ color: "#b91c1c", fontSize: 11.5, margin: "2px 0", lineHeight: 1.5 }}>Usa SOLO la red BNB Chain (BEP20)</p>
            <p style={{ color: "#b91c1c", fontSize: 11.5, margin: "2px 0", lineHeight: 1.5 }}>No uses ERC20 ni TRC20, perderas tu dinero</p>
          </div>

          <p style={{ color: THEME.text, fontWeight: 700, fontSize: 13, marginBottom: 10, textAlign: "center" }}>Pagar desde tu billetera:</p>
          <a href={"https://link.trustwallet.com/send?coin=20000714&address=" + wallet + "&amount=" + total} target="_blank" rel="noreferrer" style={btnExchange(`linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`)}>Abrir Trust Wallet</a>
          <a href="https://www.binance.com/en/my/wallet/account/main" target="_blank" rel="noreferrer" style={btnExchange("linear-gradient(135deg,#eab308,#facc15)")}>Abrir Binance</a>
          <a href={"https://metamask.app.link/send/" + wallet + "@56?value=0"} target="_blank" rel="noreferrer" style={btnExchange("linear-gradient(135deg,#334155,#1e293b)")}>Abrir MetaMask</a>

          <p style={{ color: THEME.muted, fontSize: 11, textAlign: "center", margin: "10px 0 16px" }}>O copia la wallet y pega en cualquier otra app BEP20</p>

          <div style={{ background: THEME.surfaceAlt, border: `1px solid ${THEME.border}`, borderRadius: 14, padding: "12px 14px" }}>
            <p style={{ color: THEME.primary, fontWeight: 700, fontSize: 12, margin: "0 0 8px", textAlign: "center" }}>Pasos</p>
            {["Toca un boton para abrir tu app", "Verifica que la red sea BEP20", "Confirma el monto exacto", "Envia la transaccion", "Colbisnes detectara el pago automaticamente"].map((p, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                <span style={{ width: 18, height: 18, borderRadius: "50%", background: "#dbe9fb", color: THEME.primary, fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</span>
                <span style={{ color: THEME.textSoft, fontSize: 12, lineHeight: 1.4 }}>{p}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 18 }}>
          {msRestantes !== null ? (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: msRestantes < 2 * 60 * 1000 ? "rgba(239,68,68,0.10)" : THEME.surfaceAlt, border: `1px solid ${msRestantes < 2 * 60 * 1000 ? "rgba(239,68,68,0.35)" : THEME.border}`, borderRadius: 12, padding: "8px 16px" }}>
              <span style={{ fontSize: 15 }}>⏳</span>
              <span style={{ color: THEME.muted, fontSize: 12, fontWeight: 600 }}>Tiempo para pagar:</span>
              <span style={{ color: msRestantes < 2 * 60 * 1000 ? "#b91c1c" : THEME.primary, fontSize: 16, fontWeight: 900, fontVariantNumeric: "tabular-nums", letterSpacing: "0.5px" }}>{mmss}</span>
            </div>
          ) : (
            <p style={{ color: THEME.muted, fontSize: 11, margin: 0 }}>Tienes 10 minutos para completar el pago</p>
          )}
        </div>
      </div>
      <style>{`@keyframes pulso { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
    </div>
  );
}
