"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { calcularPrecioOnline, calcularPrecioContraEntrega, calcularPrecioUSDT, calcularExtrasCheckout, PROTECCION_EXTENDIDA_PRECIO, TEST_MODE, TEST_AMOUNT } from "@/lib/pricing";
import { computeProfileCompletion } from "@/lib/profileCompletion";
import { THEME } from "@/lib/theme";
import NequiPushModal from "@/components/NequiPushModal";

type MetodoPago = "online" | "contraentrega" | "usdt";

export default function CheckoutPage() {
  const params  = useParams();
  const id      = params.id as string;
  const [producto, setProducto]     = useState<any>(null);
  const [metodo, setMetodo]         = useState<MetodoPago | null>(null);
  const [tasa, setTasa]             = useState<number>(4200);
  const [loading, setLoading]       = useState(false);
  const [showPopup, setShowPopup]   = useState(false);
  const [nivelVendedor, setNivelVendedor] = useState<string | null>(null);
  const [proteccionExtendida, setProteccionExtendida] = useState(false);
  const [errorPago, setErrorPago]   = useState<string | null>(null);
  // Datos de perfil que faltan para poder pagar/recibir (KYC, Nequi, Bre-B, anti-phishing).
  // Se calculan al entrar para AVISAR en pantalla en vez de dejar que el servidor
  // redirija bruscamente (antes eso mandaba a un localhost roto → parecía caída).
  const [perfilFaltantes, setPerfilFaltantes] = useState<{ key: string; label: string }[] | null>(null);
  // Número Nequi del perfil (para precargar el cobro push) y control del modal Nequi del pago online.
  const [nequiPrefill, setNequiPrefill] = useState<string | null>(null);
  const [showNequiOnline, setShowNequiOnline] = useState(false);

  useEffect(() => {
    fetch("/api/tasa-usdt").then(r => r.json()).then(d => { if (d.tasa) setTasa(d.tasa); });
    fetch("/api/products/" + id).then(r => r.json()).then(d => setProducto(d));
    fetch("/api/user")
      .then(r => r.json())
      .then(u => {
        if (!u || u.error) { setPerfilFaltantes([]); return; }
        setNequiPrefill(u.nequiNumber || null);
        const { faltantesCriticos } = computeProfileCompletion(u);
        // El código anti-phishing también es obligatorio para pagar (lo exige el servidor).
        const faltantes = [...faltantesCriticos];
        if (!u.antiPhishingCode || String(u.antiPhishingCode).trim().length === 0) {
          faltantes.push({ key: "antiPhishingCode", label: "Código anti fraude" });
        }
        setPerfilFaltantes(faltantes);
      })
      .catch(() => setPerfilFaltantes([]));
  }, [id]);

  useEffect(() => {
    const sellerId = producto?.sellerId || producto?.seller?.id;
    if (!sellerId) return;
    fetch("/api/trust-score/" + sellerId)
      .then(r => r.json())
      .then(d => { if (d && !d.error && d.label) setNivelVendedor(d.label); })
      .catch(() => {});
  }, [producto]);

  if (!producto) return (
    <div style={{ minHeight: "100vh", background: THEME.background, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 48, height: 48, border: `3px solid ${THEME.border}`, borderTopColor: THEME.primary, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
        <p style={{ color: THEME.primary, fontSize: 14, fontWeight: 500 }}>Cargando...</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  // Si el producto tiene una oferta aceptada, el precio a pagar es el monto de esa oferta
  // (puede ser distinto del precio publicado si el vendedor aceptó una contraoferta).
  const ofertaAceptada = producto.acceptedOfferId
    ? producto.offers?.find((o: any) => o.id === producto.acceptedOfferId)
    : null;
  const precio = ofertaAceptada ? ofertaAceptada.amountCOP : producto.priceCOP;
  const online = calcularPrecioOnline(precio, nivelVendedor);
  const contra = calcularPrecioContraEntrega(precio, nivelVendedor);
  const usdt   = calcularPrecioUSDT(precio, tasa, nivelVendedor);
  const extras = calcularExtrasCheckout(producto, proteccionExtendida);
  const extrasUSD = extras.extraTotal > 0 ? parseFloat((extras.extraTotal / tasa).toFixed(2)) : 0;
  const fmt    = (n: number) => "$" + n.toLocaleString("es-CO", { maximumFractionDigits: 0 });
  const tieneDescuento = !!nivelVendedor && (nivelVendedor === "Confiable" || nivelVendedor === "Muy confiable" || nivelVendedor === "Élite");
  const notaDescuento = tieneDescuento ? `Vendedor ${nivelVendedor} — comisión reducida por buen historial.` : undefined;

  const procesarPago = async () => {
    setLoading(true);
    setErrorPago(null);
    try {
      if (metodo === "online") {
        window.location.href = "/api/checkout/wompi?productoId=" + id + (proteccionExtendida ? "&proteccion=1" : "") + (TEST_MODE ? "&testAmount=" + TEST_AMOUNT : "");
        return;
      } else if (metodo === "contraentrega") {
        const res  = await fetch("/api/checkout/contra-entrega", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productoId: id, testMode: TEST_MODE, proteccionExtendida }) });
        const data = await res.json();
        if (data.kycRequired) { window.location.href = "/kyc"; return; }
        if (data.emailVerificationRequired) { window.location.href = "/auth/verify"; return; }
        if (data.antiPhishingRequired) { window.location.href = "/perfil/editar"; return; }
        if (data.payoutRequired) { window.location.href = "/perfil/editar?falta=pago"; return; }
        if (data.ok) { window.location.href = "/checkout/confirmacion?orderId=" + data.ordenId; return; }
        setErrorPago(data.error || "No se pudo procesar el pago. Intenta de nuevo.");
      } else if (metodo === "usdt") {
        const res  = await fetch("/api/checkout/usdt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productoId: id, tasaCOP: tasa, testMode: TEST_MODE, proteccionExtendida }) });
        const data = await res.json();
        if (data.kycRequired) { window.location.href = "/kyc"; return; }
        if (data.emailVerificationRequired) { window.location.href = "/auth/verify"; return; }
        if (data.antiPhishingRequired) { window.location.href = "/perfil/editar"; return; }
        if (data.payoutRequired) { window.location.href = "/perfil/editar?falta=pago"; return; }
        if (data.ok) { window.location.href = "/checkout/usdt-pago?orderId=" + data.ordenId + "&total=" + data.totalUSDT + "&wallet=" + data.wallet; return; }
        setErrorPago(data.error || "No se pudo procesar el pago. Intenta de nuevo.");
      }
    } catch {
      setErrorPago("Ocurrió un error de conexión. Intenta de nuevo.");
    }
    setLoading(false);
  };

  const perfilIncompleto = (perfilFaltantes?.length ?? 0) > 0;
  // Solo falta KYC → mándalo al flujo de verificación; cualquier otra cosa → editar perfil.
  const destinoCompletar = perfilFaltantes && perfilFaltantes.length === 1 && perfilFaltantes[0].key === "kycStatus"
    ? "/kyc"
    : "/perfil/editar?falta=pago";

  const handleContinuar = () => {
    if (perfilIncompleto) return;
    if (TEST_MODE) {
      setShowPopup(true);
    } else {
      procesarPago();
    }
  };

  const pctOnline = precio > 0 ? ((online.comisionColbisnes / precio) * 100) : 10;
  const pctContra = precio > 0 ? ((contra.comisionColbisnes / precio) * 100) : 3;
  const pctUsdt   = usdt.precioBaseUSD > 0 ? ((usdt.comisionUSD / usdt.precioBaseUSD) * 100) : 5;
  const fmtPct    = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1)) + "%";

  const envioUSD       = extras.envioCobrado > 0 ? parseFloat((extras.envioCobrado / tasa).toFixed(2)) : 0;
  const proteccionUSD  = extras.proteccionCosto > 0 ? parseFloat((extras.proteccionCosto / tasa).toFixed(2)) : 0;

  const desgloseExtrasCOP = [
    ...(extras.envioCobrado > 0 ? [{ label: `Envío (costo + ${Math.round(0.10 * 100)}%)`, val: fmt(extras.envioCobrado) }] : []),
    ...(extras.proteccionCosto > 0 ? [{ label: "Protección extendida", val: fmt(extras.proteccionCosto) }] : []),
  ];
  const desgloseExtrasUSD = [
    ...(envioUSD > 0 ? [{ label: "Envío (costo + margen)", val: envioUSD + " USDT" }] : []),
    ...(proteccionUSD > 0 ? [{ label: "Protección extendida", val: proteccionUSD + " USDT" }] : []),
  ];

  const metodos = [
    { id: "online" as MetodoPago, icon: "💳", titulo: "Pago online seguro", sub: "Tarjeta · PSE · Nequi · Daviplata", badge: fmtPct(pctOnline), total: TEST_MODE ? fmt(TEST_AMOUNT) : fmt(online.totalComprador + extras.extraTotal), desglose: [{ label: "Precio producto", val: fmt(online.precioBase) }, { label: TEST_MODE ? "Modo pruebas" : `Comision (${fmtPct(pctOnline)})`, val: TEST_MODE ? fmt(TEST_AMOUNT) : fmt(online.comisionColbisnes) }, ...(TEST_MODE ? [] : [{ label: "Costo de procesamiento", val: fmt(online.totalComprador - online.precioBase - online.comisionColbisnes) }]), ...(TEST_MODE ? [] : desgloseExtrasCOP)], totalLabel: "Total a pagar", totalVal: TEST_MODE ? fmt(TEST_AMOUNT) : fmt(online.totalComprador + extras.extraTotal), nota: ["Tu dinero queda protegido hasta confirmar la entrega.", notaDescuento].filter(Boolean).join(" ") },
    { id: "contraentrega" as MetodoPago, icon: "📦", titulo: "Contra entrega", sub: "Efectivo al recibir + reserva por Nequi", badge: fmtPct(pctContra), total: TEST_MODE ? fmt(TEST_AMOUNT) : fmt(contra.totalComprador + extras.extraTotal), desglose: [{ label: "Precio producto", val: fmt(contra.precioBase) }, { label: TEST_MODE ? "Modo pruebas" : `Comision (${fmtPct(pctContra)})`, val: TEST_MODE ? fmt(TEST_AMOUNT) : fmt(contra.comisionColbisnes) }, ...(TEST_MODE ? [] : desgloseExtrasCOP)], totalLabel: "Total al mensajero", totalVal: TEST_MODE ? fmt(TEST_AMOUNT) : fmt(contra.precioBase + extras.envioCobrado), steps: ["Pagas por Nequi la comisión de reserva de Colbisnes (garantiza la compra — no es el pago del producto).", "Un administrador confirma tu pago manualmente; te avisamos apenas quede listo.", "El vendedor tiene 24 horas hábiles (8am-8pm) desde que se crea tu orden para despachar el producto.", "Mensajería entrega el producto — lo revisas al recibir.", "Confirmas la entrega en la app para liberar el pago al vendedor.", "Si el vendedor no despacha a tiempo, se bloquea su cuenta y gestionamos la devolución de tu comisión."], nota: ["La comisión de reserva se paga aparte por Nequi, antes del envío.", notaDescuento].filter(Boolean).join(" — ") },
    { id: "usdt" as MetodoPago, icon: "🪙", titulo: "Pagar con USDT", sub: "BNB Chain BEP20 · Sin bancos", badge: fmtPct(pctUsdt), total: TEST_MODE ? "0.01 USDT" : (usdt.totalUSD + extrasUSD) + " USDT", desglose: [{ label: "Precio producto", val: fmt(precio) }, { label: TEST_MODE ? "Modo pruebas" : `Comision (${fmtPct(pctUsdt)})`, val: TEST_MODE ? "0.01 USDT" : usdt.comisionUSD + " USDT" }, ...(TEST_MODE ? [] : desgloseExtrasUSD)], totalLabel: "Total USDT", totalVal: TEST_MODE ? "0.01 USDT" : (usdt.totalUSD + extrasUSD) + " USDT", nota: ["Tasa: 1 USD = " + fmt(tasa) + " COP", notaDescuento].filter(Boolean).join(" · ") },
  ];

  return (
    <div style={{ minHeight: "100vh", background: THEME.background, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif", paddingBottom: 80 }}>
      <style>{`
        @keyframes spin   { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
        @keyframes popIn  { from { opacity:0; transform:scale(0.85) translateY(20px); } to { opacity:1; transform:scale(1) translateY(0); } }
        @keyframes pulse  { 0%,100% { opacity:1; } 50% { opacity:0.6; } }
        .mcard { transition: all 0.3s cubic-bezier(0.34,1.56,0.64,1); cursor: pointer; }
        .mcard:hover { transform: translateY(-3px) scale(1.01); }
        .mcard:active { transform: scale(0.98); }
        .cbtn { transition: all 0.25s cubic-bezier(0.34,1.56,0.64,1); }
        .cbtn:hover:not(:disabled) { transform: translateY(-3px); box-shadow: 0 20px 60px rgba(14,86,192,0.35) !important; }
        .glass { backdrop-filter: blur(24px) saturate(1.8); -webkit-backdrop-filter: blur(24px) saturate(1.8); }
      `}</style>

      {/* Cobro Nequi push del pago online */}
      {showNequiOnline && (
        <NequiPushModal
          endpoint="/api/checkout/nequi-online"
          body={{ productoId: id, proteccionExtendida }}
          montoLabel={fmt(online.totalComprador + extras.extraTotal)}
          prefillTelefono={nequiPrefill}
          onClose={() => setShowNequiOnline(false)}
          onApproved={(orderId) => { window.location.href = "/checkout/confirmacion?orderId=" + orderId; }}
        />
      )}

      {/* POPUP MODO PRUEBAS */}
      {showPopup && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(13,27,42,0.55)", backdropFilter: "blur(12px)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
          onClick={() => setShowPopup(false)}>
          <div className="glass" onClick={e => e.stopPropagation()}
            style={{ background: THEME.surfaceGradient, borderRadius: 28, padding: "36px 32px", maxWidth: 360, width: "100%", textAlign: "center", boxShadow: THEME.cardShadow, border: "1.5px solid transparent", animation: "popIn 0.35s cubic-bezier(0.34,1.56,0.64,1)" }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>🧪</div>
            <h2 style={{ color: THEME.text, fontSize: 20, fontWeight: 800, margin: "0 0 10px", letterSpacing: "-0.5px" }}>Modo de prueba</h2>
            <p style={{ color: THEME.primary, fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>Solo se cobrarán {fmt(TEST_AMOUNT)} pesos</p>
            <p style={{ color: THEME.muted, fontSize: 14, margin: "0 0 28px", lineHeight: 1.5 }}>Esta es una transacción de prueba.<br/>No se realizará un cobro real.</p>
            <button onClick={() => { setShowPopup(false); procesarPago(); }}
              style={{ width: "100%", padding: "16px", borderRadius: 16, border: "none", background: `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`, color: "#fff", fontSize: 16, fontWeight: 800, cursor: "pointer", boxShadow: `0 8px 32px ${THEME.primary}44`, marginBottom: 10 }}>
              Entendido, continuar →
            </button>
            <button onClick={() => setShowPopup(false)}
              style={{ width: "100%", padding: "12px", borderRadius: 16, border: `1.5px solid ${THEME.border}`, background: "transparent", color: THEME.primary, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div className="glass" style={{ background: `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`, padding: "24px 20px 28px", boxShadow: "0 8px 40px rgba(10,46,107,0.25)" }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
            <img src="/logo-white.svg?v=2" alt="Colbisnes" style={{ height: 44, width: "auto" }} />
            {TEST_MODE && <span style={{ fontSize: 10, color: "#fff", background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", padding: "3px 8px", borderRadius: 20, fontWeight: 700, animation: "pulse 2s infinite" }}>PRUEBAS</span>}
            <span style={{ marginLeft: "auto", fontSize: 11, color: "#fff", background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.25)", padding: "4px 12px", borderRadius: 20, fontWeight: 600 }}>🔒 Pago seguro</span>
          </div>
          <div className="glass" style={{ background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 18, padding: "16px 18px", textAlign: "center" }}>
            <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, margin: "0 0 6px", fontWeight: 500 }}>{producto.title}</p>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 12 }}>
              <p style={{ color: "#fff", fontSize: 32, fontWeight: 900, margin: 0, letterSpacing: "-1px" }}>{fmt(precio)}</p>
              {TEST_MODE && <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 14, fontWeight: 700, margin: 0 }}>→ cobro real: {fmt(TEST_AMOUNT)}</p>}
            </div>
          </div>
        </div>
      </div>

      {/* METODOS */}
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "24px 16px 0" }}>
        <p style={{ color: THEME.muted, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16, textAlign: "center" }}>Selecciona tu metodo de pago</p>

        {metodos.map(m => {
          const active = metodo === m.id;
          return (
            <div key={m.id} className="mcard glass" onClick={() => { setMetodo(m.id); setErrorPago(null); }}
              style={{
                background: active ? "#eef3fb" : THEME.surface,
                border: active ? `1.5px solid ${THEME.primary}` : `1.5px solid ${THEME.border}`,
                borderRadius: 22, padding: "18px 20px", marginBottom: 14,
                boxShadow: active ? `0 8px 30px ${THEME.primary}26,inset 0 1px 0 rgba(255,255,255,0.9)` : THEME.cardShadow,
              }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 48, height: 48, flexShrink: 0, background: active ? "#dbe9fb" : THEME.surfaceAlt, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, border: `1px solid ${THEME.border}`, boxShadow: active ? `0 4px 16px ${THEME.primary}22` : "none" }}>{m.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    <span style={{ color: THEME.text, fontWeight: 700, fontSize: 15 }}>{m.titulo}</span>
                    <span style={{ fontSize: 10, fontWeight: 800, color: "#fff", background: `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`, padding: "2px 8px", borderRadius: 20, boxShadow: `0 2px 8px ${THEME.primary}44` }}>{m.badge}</span>
                  </div>
                  <span style={{ color: THEME.muted, fontSize: 12 }}>{m.sub}</span>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <p style={{ color: THEME.primary, fontWeight: 800, fontSize: 16, margin: 0 }}>{m.total}</p>
                  <p style={{ color: THEME.muted, fontSize: 10, margin: "2px 0 0" }}>total</p>
                </div>
              </div>
              {active && (
                <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${THEME.border}`, animation: "fadeUp 0.25s ease" }}>
                  {m.desglose.map(d => (
                    <div key={d.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: THEME.muted, marginBottom: 8 }}>
                      <span>{d.label}</span><span style={{ color: THEME.textSoft, fontWeight: 600 }}>{d.val}</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 800, borderTop: `1px solid ${THEME.border}`, paddingTop: 10, marginTop: 4 }}>
                    <span style={{ color: THEME.text }}>{m.totalLabel}</span>
                    <span style={{ background: `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{m.totalVal}</span>
                  </div>
                  {m.nota && <p style={{ fontSize: 12, color: THEME.muted, marginTop: 10, lineHeight: 1.5 }}>{m.nota}</p>}
                  {(m as any).steps && (
                    <div className="glass" style={{ marginTop: 14, background: THEME.surfaceAlt, border: `1px solid ${THEME.border}`, borderRadius: 14, padding: "12px 14px" }}>
                      <p style={{ color: THEME.primary, fontSize: 12, fontWeight: 700, margin: "0 0 10px" }}>Como funciona:</p>
                      {(m as any).steps.map((s: string, i: number) => (
                        <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}>
                          <span style={{ width: 20, height: 20, borderRadius: "50%", background: `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`, color: "#fff", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: `0 2px 8px ${THEME.primary}44` }}>{i + 1}</span>
                          <span style={{ color: THEME.textSoft, fontSize: 12, lineHeight: 1.6 }}>{s}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {metodo && !TEST_MODE && (
          <div
            onClick={() => setProteccionExtendida(p => !p)}
            className="glass"
            style={{
              display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
              background: proteccionExtendida ? "#eef3fb" : THEME.surface,
              border: proteccionExtendida ? `1.5px solid ${THEME.primary}` : `1.5px solid ${THEME.border}`,
              borderRadius: 18, padding: "14px 16px", marginTop: 4, marginBottom: 14,
            }}
          >
            <div style={{
              width: 22, height: 22, borderRadius: 7, flexShrink: 0,
              border: `1.5px solid ${proteccionExtendida ? THEME.primary : THEME.border}`,
              background: proteccionExtendida ? THEME.primary : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 900,
            }}>{proteccionExtendida ? "✓" : ""}</div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: THEME.text }}>🛡️ Protección de compra extendida</p>
              <p style={{ margin: "2px 0 0", fontSize: 11.5, color: THEME.muted, lineHeight: 1.4 }}>Tu reclamo se revisa con prioridad si algo sale mal — {fmt(PROTECCION_EXTENDIDA_PRECIO)}</p>
            </div>
          </div>
        )}

        {errorPago && (
          <div style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 14, padding: "12px 14px", marginBottom: 14, display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ fontSize: 16 }}>⚠️</span>
            <p style={{ margin: 0, color: "#b91c1c", fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>{errorPago}</p>
          </div>
        )}

        {metodo && perfilIncompleto && (
          <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 16, padding: "16px 18px", marginBottom: 14 }}>
            <p style={{ margin: 0, color: "#9a3412", fontSize: 14, fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>🔒</span> No puedes pagar todavía
            </p>
            <p style={{ margin: "6px 0 0", color: "#9a3412", fontSize: 13, lineHeight: 1.5 }}>
              Para proteger tu dinero y poder devolvértelo si algo sale mal, primero completa tu información de pagos:
            </p>
            <ul style={{ margin: "8px 0 0", padding: "0 0 0 18px", color: "#9a3412", fontSize: 13, lineHeight: 1.6 }}>
              {perfilFaltantes!.map(f => <li key={f.key}>{f.label}</li>)}
            </ul>
            <a href={destinoCompletar}
              style={{ display: "block", textAlign: "center", marginTop: 12, padding: "13px", borderRadius: 14, background: `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`, color: "#fff", fontSize: 15, fontWeight: 800, textDecoration: "none", boxShadow: `0 8px 24px ${THEME.primary}33` }}>
              Completar mi información →
            </a>
          </div>
        )}

        {metodo && !perfilIncompleto && (
          <button className="cbtn" onClick={handleContinuar} disabled={loading || perfilFaltantes === null}
            style={{ width: "100%", padding: 18, borderRadius: 18, border: "none", background: (loading || perfilFaltantes === null) ? "#e2e8f0" : `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`, color: "#fff", fontSize: 17, fontWeight: 800, cursor: (loading || perfilFaltantes === null) ? "default" : "pointer", marginTop: 8, boxShadow: `0 12px 40px ${THEME.primary}44` }}>
            {loading ? "Procesando..." : perfilFaltantes === null ? "Verificando..." : "Continuar →"}
          </button>
        )}

        {/* Botón exclusivo de Nequi (pago online): notificación push directa a la app del comprador. */}
        {metodo === "online" && !perfilIncompleto && !TEST_MODE && perfilFaltantes !== null && (
          <button onClick={() => setShowNequiOnline(true)}
            style={{ width: "100%", padding: 15, borderRadius: 16, border: "1.5px solid #a855f7", background: "#fff", color: "#7e22ce", fontSize: 15, fontWeight: 800, cursor: "pointer", marginTop: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            💜 Pagar con Nequi (sin salir de la app)
          </button>
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 20 }}>
          <span style={{ fontSize: 11, color: THEME.muted }}>🔒 SSL cifrado · Pagos protegidos por Colbisnes</span>
        </div>
      </div>
    </div>
  );
}
