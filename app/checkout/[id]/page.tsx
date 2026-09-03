"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { calcularPrecioOnline, calcularPrecioContraEntrega, calcularPrecioUSDT, calcularExtrasCheckout, nivelParaDescuento, PROTECCION_EXTENDIDA_PRECIO, TEST_MODE, TEST_AMOUNT } from "@/lib/pricing";
import { computeProfileCompletion } from "@/lib/profileCompletion";
import { limpiarDireccion, validarDireccionEnvio, DIRECCION_LARGO_MAXIMO } from "@/lib/direccion";
import { THEME } from "@/lib/theme";
import NequiPushModal from "@/components/NequiPushModal";
import { useModoPrueba } from "@/lib/useModoPrueba";
import { MENSAJE_PAGO_BLOQUEADO } from "@/lib/modoPrueba";

type MetodoPago = "online" | "contraentrega" | "usdt";

export default function CheckoutPage() {
  const params  = useParams();
  const id      = params.id as string;
  const [producto, setProducto]     = useState<any>(null);
  const [metodo, setMetodo]         = useState<MetodoPago | null>(null);
  const [tasa, setTasa]             = useState<number>(4200);
  const [loading, setLoading]       = useState(false);
  const [showPopup, setShowPopup]   = useState(false);
  const [nivelConDescuento, setNivelConDescuento] = useState<string | null>(null);
  const [proteccionExtendida, setProteccionExtendida] = useState(false);
  const [errorPago, setErrorPago]   = useState<string | null>(null);
  // Datos de perfil que faltan para poder pagar/recibir (KYC, Nequi, Bre-B, anti-phishing).
  // Se calculan al entrar para AVISAR en pantalla en vez de dejar que el servidor
  // redirija bruscamente (antes eso mandaba a un localhost roto → parecía caída).
  const [perfilFaltantes, setPerfilFaltantes] = useState<{ key: string; label: string }[] | null>(null);
  // Número Nequi del perfil (para precargar el cobro push) y control del modal Nequi del pago online.
  const [nequiPrefill, setNequiPrefill] = useState<string | null>(null);
  const [showNequiOnline, setShowNequiOnline] = useState(false);
  // Pantalla de devolución por información falsa. Solo aparece cuando el vendedor
  // declaró datos del equipo (IMEI, batería o piezas), que es justo cuando hay algo
  // concreto que pueda no corresponder al recibirlo.
  const [mostrarGarantia, setMostrarGarantia]   = useState(false);
  const [garantiaAceptada, setGarantiaAceptada] = useState(false);
  const [guardandoGarantia, setGuardandoGarantia] = useState(false);
  const [accionPendiente, setAccionPendiente]   = useState<"pago" | "nequi" | null>(null);
  // Confirmación de la dirección de envío. Antes NUNCA se le preguntaba al comprador a
  // dónde mandar: la dirección vivía suelta en el perfil y el vendedor abría "Registrar
  // envío" sin verla por ningún lado — le tocaba pedirla por el chat. Aquí se le muestra
  // la que tiene guardada para que la confirme (o la corrija) antes de pagar, y de ahí
  // queda copiada en la orden.
  const [direccionPerfil, setDireccionPerfil]       = useState<string>("");
  const [mostrarDireccion, setMostrarDireccion]     = useState(false);
  const [direccionConfirmada, setDireccionConfirmada] = useState(false);
  const [editandoDireccion, setEditandoDireccion]   = useState(false);
  const [direccionBorrador, setDireccionBorrador]   = useState("");
  const [guardandoDireccion, setGuardandoDireccion] = useState(false);
  const [errorDireccion, setErrorDireccion]         = useState<string | null>(null);
  const [accionDireccion, setAccionDireccion]       = useState<"pago" | "nequi" | null>(null);
  // Modo prueba del prelanzamiento: quien entró con el link secreto puede recorrer
  // todo el checkout y ver los precios, pero no puede pagar. El servidor bloquea
  // igual (ver lib/modoPrueba.ts); esto es para que no llegue a intentarlo.
  const modoPrueba = useModoPrueba();

  useEffect(() => {
    fetch("/api/tasa-usdt").then(r => r.json()).then(d => { if (d.tasa) setTasa(d.tasa); });
    fetch("/api/products/" + id).then(r => r.json()).then(d => setProducto(d));
    fetch("/api/user")
      .then(r => r.json())
      .then(u => {
        if (!u || u.error) { setPerfilFaltantes([]); return; }
        setNequiPrefill(u.nequiNumber || null);
        setDireccionPerfil(u.direccionEnvio || "");
        // El código anti fraude ya viene dentro de los críticos (lib/profileCompletion.ts).
        // Antes se añadía aquí a mano, porque allá no estaba marcado como crítico; ahora sí
        // lo está, y repetirlo haría que saliera dos veces en la lista de "te falta".
        const { faltantesCriticos } = computeProfileCompletion(u);
        setPerfilFaltantes(faltantesCriticos);
      })
      .catch(() => setPerfilFaltantes([]));
  }, [id]);

  // Vuelta desde /api/checkout/wompi cuando al VENDEDOR le faltan los datos de cobro.
  // Esa ruta es una navegación (no un fetch), así que no puede contestar JSON: nos
  // devuelve aquí con ?error=... y el aviso se pinta en el mismo recuadro rojo que
  // usan contra-entrega y USDT.
  //
  // Se lee de window.location en vez de useSearchParams a propósito: useSearchParams
  // obliga a envolver el componente en <Suspense> o el build falla al prerenderizar.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("error") !== "vendedor-sin-cobro") return;
    setErrorPago("Este producto no se puede comprar ahora mismo: el vendedor todavía no ha terminado de configurar su cuenta para recibir pagos.");
  }, []);

  useEffect(() => {
    const sellerId = producto?.sellerId || producto?.seller?.id;
    if (!sellerId) return;
    fetch("/api/trust-score/" + sellerId)
      .then(r => r.json())
      // Se guarda el nivel que da DESCUENTO, no el que se muestra: sin negocios cerrados
      // nivelParaDescuento devuelve null y el checkout cobra la comisión completa, igual que
      // el servidor. El nivel visible lo pinta <TrustBadge/> aparte.
      .then(d => { if (d && !d.error && d.label) setNivelConDescuento(nivelParaDescuento(d.label, d.completedOrdersCount)); })
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
  const online = calcularPrecioOnline(precio, nivelConDescuento);
  const contra = calcularPrecioContraEntrega(precio, nivelConDescuento);
  const usdt   = calcularPrecioUSDT(precio, tasa, nivelConDescuento);
  const extras = calcularExtrasCheckout(producto, proteccionExtendida);
  const extrasUSD = extras.extraTotal > 0 ? parseFloat((extras.extraTotal / tasa).toFixed(2)) : 0;
  const fmt    = (n: number) => "$" + n.toLocaleString("es-CO", { maximumFractionDigits: 0 });
  const tieneDescuento = !!nivelConDescuento && (nivelConDescuento === "Confiable" || nivelConDescuento === "Muy confiable" || nivelConDescuento === "Élite");
  const notaDescuento = tieneDescuento ? `Vendedor ${nivelConDescuento} — comisión reducida por buen historial.` : undefined;
  // Comisión "sin descuento" (nivel neutro) para mostrarle al comprador cuánto se ahorra por
  // comprarle a un vendedor de buen nivel. USDT no aplica descuento por nivel, así que no entra.
  const onlineSinDesc = calcularPrecioOnline(precio, null);
  const contraSinDesc = calcularPrecioContraEntrega(precio, null);
  const ahorroOnline  = Math.max(0, onlineSinDesc.comisionColbisnes - online.comisionColbisnes);
  const ahorroContra  = Math.max(0, contraSinDesc.comisionColbisnes - contra.comisionColbisnes);

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

  const seguirConElPago = () => {
    if (TEST_MODE) {
      setShowPopup(true);
    } else {
      procesarPago();
    }
  };

  // ¿Hay algo declarado que el comprador pueda reclamar después? Si el vendedor no
  // escribió nada del equipo, la pantalla no tiene objeto y no se muestra: un aviso
  // que sale siempre deja de leerse, y este necesita leerse.
  const hayDatosDeclarados = !!(
    producto?.tieneImei ||
    producto?.saludBateria != null ||
    (producto?.piezasReemplazadas && String(producto.piezasReemplazadas).trim() !== "")
  );

  /**
   * Puerta única antes de pagar. Si hay datos declarados y todavía no se aceptó la
   * condición de devolución, guarda la intención y abre la pantalla; si no, sigue
   * derecho. Vale tanto para el botón grande como para el de Nequi.
   */
  const conGarantia = (accion: "pago" | "nequi") => {
    if (!hayDatosDeclarados || garantiaAceptada) {
      if (accion === "nequi") setShowNequiOnline(true); else seguirConElPago();
      return;
    }
    setAccionPendiente(accion);
    setMostrarGarantia(true);
  };

  const aceptarGarantia = async () => {
    setGuardandoGarantia(true);
    // Se deja constancia en el servidor (quién, cuándo, desde dónde y qué decía la
    // publicación en ese momento). Si la llamada falla NO se bloquea la compra: un
    // problema de red no puede dejar a alguien sin poder pagar. El registro es una
    // ayuda para resolver disputas, no un candado del dinero.
    try {
      await fetch(`/api/products/${id}/aceptar-garantia`, { method: "POST", credentials: "include" });
    } catch { /* la compra sigue */ }
    setGuardandoGarantia(false);
    setGarantiaAceptada(true);
    setMostrarGarantia(false);
    const accion = accionPendiente;
    setAccionPendiente(null);
    if (accion === "nequi") setShowNequiOnline(true); else seguirConElPago();
  };

  /* ── Confirmación de la dirección de envío ───────────────────────────────────
     Puerta que va ANTES de la de garantía. El orden importa: la de garantía es la
     última advertencia seria antes de que se mueva la plata, así que conviene que
     sea lo último que se lee; esta otra es una confirmación de un dato y va primero.

     En EN_PERSONA no se pide: no hay paquete que despachar y sería recoger un dato
     personal para nada. En AMBOS sí se pide, porque desde aquí no se sabe cuál de
     las dos formas va a escoger, y es mejor que al vendedor le sobre la dirección
     a que le falte (mismo criterio que lib/direccionOrden.ts). */
  const necesitaDireccion = producto?.tipoEntrega !== "EN_PERSONA";

  const conDireccion = (accion: "pago" | "nequi") => {
    if (!necesitaDireccion || direccionConfirmada) { conGarantia(accion); return; }
    setAccionDireccion(accion);
    setDireccionBorrador(direccionPerfil);
    // Sin dirección guardada entra derecho en modo escritura: la alternativa era
    // mandarlo al perfil y devolverlo, y ahí es donde la gente abandona la compra.
    setEditandoDireccion(!direccionPerfil);
    setErrorDireccion(null);
    setMostrarDireccion(true);
  };

  const confirmarDireccion = async () => {
    const accion = accionDireccion;

    // Confirma la que ya tenía, sin tocarla: no hay nada que guardar.
    if (!editandoDireccion) {
      setMostrarDireccion(false);
      setDireccionConfirmada(true);
      setAccionDireccion(null);
      if (accion) conGarantia(accion);
      return;
    }

    // La escribió o la corrigió. Se revisa con la MISMA regla que usa el servidor
    // (lib/direccion.ts) para no mostrarle un error distinto al de siempre.
    const dir = limpiarDireccion(direccionBorrador).trim();
    if (!dir) { setErrorDireccion("Escribe la dirección a donde te llega el paquete."); return; }
    const revision = validarDireccionEnvio(dir);
    if (!revision.valido) { setErrorDireccion(revision.motivo || "Revisa la dirección."); return; }

    setGuardandoDireccion(true);
    setErrorDireccion(null);
    try {
      const res = await fetch("/api/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ direccionEnvio: dir }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo guardar la dirección.");

      setDireccionPerfil(dir);
      setGuardandoDireccion(false);
      setMostrarDireccion(false);
      setEditandoDireccion(false);
      setDireccionConfirmada(true);
      setAccionDireccion(null);
      if (accion) conGarantia(accion);
    } catch (e: any) {
      // Aquí SÍ se bloquea si falla, al revés que en la pantalla de garantía. Allá el
      // registro es una ayuda para disputas y no vale dejar a nadie sin poder pagar por
      // un problema de red. Acá es distinto: la orden copia la dirección del perfil, así
      // que si el guardado no entró, la compra saldría con la dirección vieja (o sin
      // ninguna) y el paquete se despacharía al lugar equivocado.
      setGuardandoDireccion(false);
      setErrorDireccion(e.message || "No se pudo guardar la dirección. Revisa tu conexión e intenta de nuevo.");
    }
  };

  const handleContinuar = () => {
    if (perfilIncompleto) return;
    if (modoPrueba) return; // el botón ya está deshabilitado; esto es el cinturón
    conDireccion("pago");
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
  // Contra entrega no incluye protección extendida (solo se cobra en pago online/USDT, donde el
  // cargo es electrónico). Su desglose y totales llevan únicamente el envío.
  const desgloseExtrasContraCOP = [
    ...(extras.envioCobrado > 0 ? [{ label: `Envío (costo + ${Math.round(0.10 * 100)}%)`, val: fmt(extras.envioCobrado) }] : []),
  ];
  const desgloseExtrasUSD = [
    ...(envioUSD > 0 ? [{ label: "Envío (costo + margen)", val: envioUSD + " USDT" }] : []),
    ...(proteccionUSD > 0 ? [{ label: "Protección extendida", val: proteccionUSD + " USDT" }] : []),
  ];

  const metodos = [
    { id: "online" as MetodoPago, icon: "💳", titulo: "Pago online seguro", sub: "Tarjeta · PSE · Nequi · Daviplata", badge: fmtPct(pctOnline), total: TEST_MODE ? fmt(TEST_AMOUNT) : fmt(online.totalComprador + extras.extraTotal), desglose: [{ label: "Precio producto", val: fmt(online.precioBase) }, { label: TEST_MODE ? "Modo pruebas" : `Comision (${fmtPct(pctOnline)})`, val: TEST_MODE ? fmt(TEST_AMOUNT) : fmt(online.comisionColbisnes), ...(!TEST_MODE && ahorroOnline > 0 ? { was: fmt(onlineSinDesc.comisionColbisnes) } : {}) }, ...(!TEST_MODE && ahorroOnline > 0 ? [{ label: `Ahorras · vendedor ${nivelConDescuento}`, val: "−" + fmt(ahorroOnline), highlight: true }] : []), ...(TEST_MODE ? [] : [{ label: "Costo de procesamiento", val: fmt(online.totalComprador - online.precioBase - online.comisionColbisnes) }]), ...(TEST_MODE ? [] : desgloseExtrasCOP)], totalLabel: "Total a pagar", totalVal: TEST_MODE ? fmt(TEST_AMOUNT) : fmt(online.totalComprador + extras.extraTotal), nota: ["Tu dinero queda protegido hasta confirmar la entrega.", notaDescuento].filter(Boolean).join(" ") },
    { id: "contraentrega" as MetodoPago, icon: "📦", titulo: "Contra entrega", sub: "Efectivo al recibir + reserva por Nequi", badge: fmtPct(pctContra), total: TEST_MODE ? fmt(TEST_AMOUNT) : fmt(contra.totalComprador + extras.envioCobrado), desglose: [{ label: "Precio producto", val: fmt(contra.precioBase) }, { label: TEST_MODE ? "Modo pruebas" : `Comision (${fmtPct(pctContra)})`, val: TEST_MODE ? fmt(TEST_AMOUNT) : fmt(contra.comisionColbisnes), ...(!TEST_MODE && ahorroContra > 0 ? { was: fmt(contraSinDesc.comisionColbisnes) } : {}) }, ...(!TEST_MODE && ahorroContra > 0 ? [{ label: `Ahorras · vendedor ${nivelConDescuento}`, val: "−" + fmt(ahorroContra), highlight: true }] : []), ...(TEST_MODE ? [] : desgloseExtrasContraCOP)], totalLabel: "Total al mensajero", totalVal: TEST_MODE ? fmt(TEST_AMOUNT) : fmt(contra.precioBase + extras.envioCobrado), steps: ["Pagas por Nequi la comisión de reserva de Colbisnes (garantiza la compra — no es el pago del producto).", "Un administrador confirma tu pago manualmente; te avisamos apenas quede listo.", "El vendedor tiene 24 horas hábiles (8am-8pm) desde que se crea tu orden para despachar el producto.", "Mensajería entrega el producto — lo revisas al recibir.", "Confirmas la entrega en la app para liberar el pago al vendedor.", "Si el vendedor no despacha a tiempo, se bloquea su cuenta y gestionamos la devolución de tu comisión."], nota: ["La comisión de reserva se paga aparte por Nequi, antes del envío.", notaDescuento].filter(Boolean).join(" — ") },
    { id: "usdt" as MetodoPago, icon: "🪙", titulo: "Pagar con USDT", sub: "BNB Chain BEP20 · Sin bancos", badge: fmtPct(pctUsdt), total: TEST_MODE ? "0.01 USDT" : (usdt.totalUSD + extrasUSD) + " USDT", desglose: [{ label: "Precio producto", val: fmt(precio) }, { label: TEST_MODE ? "Modo pruebas" : `Comision (${fmtPct(pctUsdt)})`, val: TEST_MODE ? "0.01 USDT" : usdt.comisionUSD + " USDT" }, ...(TEST_MODE ? [] : desgloseExtrasUSD)], totalLabel: "Total USDT", totalVal: TEST_MODE ? "0.01 USDT" : (usdt.totalUSD + extrasUSD) + " USDT", nota: "Tasa: 1 USD = " + fmt(tasa) + " COP" },
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
                    <div key={d.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: (d as any).highlight ? THEME.success : THEME.muted, marginBottom: 8 }}>
                      <span>{d.label}</span>
                      <span style={{ color: (d as any).highlight ? THEME.success : THEME.textSoft, fontWeight: (d as any).highlight ? 800 : 600 }}>
                        {(d as any).was && <span style={{ textDecoration: "line-through", color: THEME.muted, fontWeight: 400, marginRight: 6 }}>{(d as any).was}</span>}
                        {d.val}
                      </span>
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

        {metodo && metodo !== "contraentrega" && !TEST_MODE && (
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

        {/* En modo prueba no tiene sentido pedirle que complete el perfil "para poder
            pagar": no va a poder pagar de todas formas. Gana el aviso de modo prueba. */}
        {metodo && perfilIncompleto && !modoPrueba && (
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

        {/* ACCESO ANTICIPADO: el pago queda deshabilitado. No hay llaves de
            sandbox de Wompi en el proyecto (solo las de producción), así que no
            existe un destino de pruebas al que mandar al comprador — la única
            alternativa honesta es no dejar pagar y decirlo con claridad.

            El texto habla de "acceso anticipado" y no de "probador" desde el
            2026-08-02: a partir de esa fecha el enlace de acceso viaja en el
            correo de bienvenida de la lista de espera, así que quien llega aquí
            ya no es alguien de confianza probando, sino un usuario cualquiera
            que se apuntó. Llamarle probador le sugiere que lo que está viendo
            es un simulacro, y lo que ve son precios y productos de verdad. */}
        {metodo && modoPrueba && (
          <>
            <div style={{ background: "#fffbeb", border: "1.5px solid #fcd34d", borderRadius: 16, padding: "16px 18px", marginBottom: 12 }}>
              {/* alignItems flex-start, no center: el mensaje envuelve en dos o
                  tres líneas en un móvil y con center el ⚠️ quedaba flotando a
                  media altura del párrafo. */}
              <p style={{ margin: 0, color: "#92400e", fontSize: 14, fontWeight: 800, display: "flex", alignItems: "flex-start", gap: 8, lineHeight: 1.45 }}>
                <span style={{ fontSize: 18, lineHeight: 1.1 }}>⚠️</span> {MENSAJE_PAGO_BLOQUEADO}
              </p>
              <p style={{ margin: "6px 0 0", color: "#92400e", fontSize: 13, lineHeight: 1.5 }}>
                Puedes revisar precios, comisiones y todo el flujo. Mientras tanto, publica lo que
                quieras vender: cuando se abran las compras tu tienda ya está lista.
              </p>
            </div>
            <button disabled
              style={{ width: "100%", padding: 18, borderRadius: 18, border: "none", background: "#e2e8f0", color: "#64748b", fontSize: 17, fontWeight: 800, cursor: "not-allowed", marginTop: 0 }}>
              Pago deshabilitado en modo prueba
            </button>
          </>
        )}

        {metodo && !perfilIncompleto && !modoPrueba && (
          <button className="cbtn" onClick={handleContinuar} disabled={loading || perfilFaltantes === null}
            style={{ width: "100%", padding: 18, borderRadius: 18, border: "none", background: (loading || perfilFaltantes === null) ? "#e2e8f0" : `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`, color: "#fff", fontSize: 17, fontWeight: 800, cursor: (loading || perfilFaltantes === null) ? "default" : "pointer", marginTop: 8, boxShadow: `0 12px 40px ${THEME.primary}44` }}>
            {loading ? "Procesando..." : perfilFaltantes === null ? "Verificando..." : "Continuar →"}
          </button>
        )}

        {/* Botón exclusivo de Nequi (pago online): notificación push directa a la app del comprador. */}
        {metodo === "online" && !perfilIncompleto && !TEST_MODE && !modoPrueba && perfilFaltantes !== null && (
          <button onClick={() => conDireccion("nequi")}
            style={{ width: "100%", padding: 15, borderRadius: 16, border: `1.5px solid ${THEME.gold}`, background: "#fff", color: THEME.gold, fontSize: 15, fontWeight: 800, cursor: "pointer", marginTop: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            💳 Pagar con Nequi (sin salir de la app)
          </button>
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 20 }}>
          <span style={{ fontSize: 11, color: THEME.muted }}>🔒 SSL cifrado · Pagos protegidos por Colbisnes</span>
        </div>

        {/* ══ CONFIRMAR DIRECCIÓN DE ENVÍO ══════════════════════════════════════
            No se cierra tocando el fondo ni con una ✕, igual que la de garantía: las
            únicas salidas son confirmar o corregir. Si se pudiera esquivar, la orden
            volvería a nacer sin dirección y el vendedor quedaría otra vez a ciegas. */}
        {mostrarDireccion && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(13,27,42,0.55)", backdropFilter: "blur(12px)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <div style={{ background: "#fff", borderRadius: 22, padding: "26px 22px", maxWidth: 420, width: "100%", boxShadow: "0 24px 70px rgba(0,0,0,0.3)", maxHeight: "88vh", overflowY: "auto" }}>
              <div style={{ fontSize: 44, textAlign: "center", marginBottom: 10 }}>📍</div>
              <h2 style={{ margin: 0, fontSize: 19, fontWeight: 900, color: THEME.text, textAlign: "center", lineHeight: 1.3 }}>
                Por favor confirma tu dirección de envío
              </h2>

              {editandoDireccion ? (
                <>
                  <p style={{ margin: "14px 0 0", fontSize: 14, color: THEME.textSoft, lineHeight: 1.6 }}>
                    {direccionPerfil
                      ? "Escribe la dirección a la que quieres que llegue este pedido."
                      : "Todavía no tienes una dirección guardada. Escríbela aquí y la dejamos lista en tu perfil para tus próximas compras."}
                  </p>
                  <textarea
                    value={direccionBorrador}
                    onChange={e => { setDireccionBorrador(limpiarDireccion(e.target.value)); setErrorDireccion(null); }}
                    maxLength={DIRECCION_LARGO_MAXIMO}
                    rows={3}
                    autoFocus
                    placeholder="Ej: Calle 123 #45-67, Apto 302, Barrio Chapinero, Bogotá"
                    style={{ width: "100%", marginTop: 12, padding: "12px 14px", borderRadius: 14, border: `1.5px solid ${errorDireccion ? "#ef4444" : THEME.border}`, background: THEME.surfaceAlt, color: THEME.text, fontSize: 15, lineHeight: 1.5, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }}
                  />
                  <p style={{ margin: "6px 0 0", fontSize: 11.5, color: THEME.muted }}>
                    Incluye el barrio y la ciudad. Si es en el campo, la vereda y un punto de referencia.
                  </p>
                </>
              ) : (
                <>
                  <p style={{ margin: "14px 0 0", fontSize: 14, color: THEME.textSoft, lineHeight: 1.6 }}>
                    Este es el dato que le va a llegar al vendedor para despachar tu pedido.
                    Revísalo bien antes de pagar.
                  </p>
                  <div style={{ marginTop: 14, background: "#f0f7ff", border: `1px solid ${THEME.border}`, borderRadius: 14, padding: "14px 16px" }}>
                    {/* overflowWrap:anywhere — una dirección larga pegada sin espacios no
                        puede ensanchar el recuadro y sacarlo de la pantalla del teléfono. */}
                    <p style={{ margin: 0, fontSize: 15, color: THEME.text, fontWeight: 700, lineHeight: 1.55, overflowWrap: "anywhere" }}>
                      {direccionPerfil}
                    </p>
                  </div>
                </>
              )}

              {errorDireccion && (
                <div style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 12, padding: "10px 13px", marginTop: 12, display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 15, lineHeight: 1.2 }}>⚠️</span>
                  <p style={{ margin: 0, color: "#b91c1c", fontSize: 13, fontWeight: 600, lineHeight: 1.45 }}>{errorDireccion}</p>
                </div>
              )}

              <button onClick={confirmarDireccion} disabled={guardandoDireccion}
                style={{ width: "100%", marginTop: 20, padding: 16, borderRadius: 16, border: "none", background: guardandoDireccion ? "#e2e8f0" : `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`, color: guardandoDireccion ? "#64748b" : "#fff", fontSize: 16, fontWeight: 800, cursor: guardandoDireccion ? "default" : "pointer" }}>
                {guardandoDireccion ? "Guardando…" : editandoDireccion ? "Guardar y continuar" : "Sí, enviar a esta dirección"}
              </button>

              {!editandoDireccion && (
                <button onClick={() => { setEditandoDireccion(true); setDireccionBorrador(direccionPerfil); setErrorDireccion(null); }}
                  style={{ width: "100%", marginTop: 8, padding: 13, borderRadius: 14, border: `1.5px solid ${THEME.border}`, background: "transparent", color: THEME.primary, fontSize: 14.5, fontWeight: 700, cursor: "pointer" }}>
                  Cambiar dirección
                </button>
              )}

              <button onClick={() => { setMostrarDireccion(false); setAccionDireccion(null); setErrorDireccion(null); setEditandoDireccion(false); }} disabled={guardandoDireccion}
                style={{ width: "100%", marginTop: 8, padding: 12, borderRadius: 14, border: "none", background: "transparent", color: THEME.muted, fontSize: 14, fontWeight: 700, cursor: guardandoDireccion ? "default" : "pointer" }}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* ══ DEVOLUCIÓN POR INFORMACIÓN FALSA ══════════════════════════════════
            Sale ANTES de pagar, no después, porque después ya no es un aviso sino
            una excusa. No se cierra tocando el fondo ni con una ✕: las dos únicas
            salidas son aceptar o volver atrás, para que no se despache sin leer. */}
        {mostrarGarantia && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(13,27,42,0.55)", backdropFilter: "blur(12px)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <div style={{ background: "#fff", borderRadius: 22, padding: "26px 22px", maxWidth: 420, width: "100%", boxShadow: "0 24px 70px rgba(0,0,0,0.3)", maxHeight: "88vh", overflowY: "auto" }}>
              <div style={{ fontSize: 44, textAlign: "center", marginBottom: 10 }}>🛡️</div>
              <h2 style={{ margin: 0, fontSize: 19, fontWeight: 900, color: THEME.text, textAlign: "center", lineHeight: 1.3 }}>
                Si la información no corresponde, lo devuelves
              </h2>

              <p style={{ margin: "14px 0 0", fontSize: 14, color: THEME.textSoft, lineHeight: 1.6 }}>
                El IMEI, la salud de la batería y las piezas reemplazadas de esta publicación
                <strong> los declara el vendedor</strong>. Colbisnes no los verifica.
              </p>

              <div style={{ marginTop: 14, background: "#f0f7ff", border: `1px solid ${THEME.border}`, borderRadius: 14, padding: "14px 16px" }}>
                <p style={{ margin: 0, fontSize: 14, color: THEME.text, fontWeight: 700, lineHeight: 1.55 }}>
                  Si al recibir el producto la información no corresponde con lo publicado,
                  puedes devolverlo por información falsa suministrada y se te devuelve
                  el dinero que está en custodia.
                </p>
              </div>

              <p style={{ margin: "14px 0 0", fontSize: 13, color: THEME.muted, lineHeight: 1.55 }}>
                Por eso tu plata no le llega al vendedor cuando pagas: queda retenida por
                Colbisnes hasta que tú confirmes que recibiste lo que decía el anuncio.
                Revisa el equipo apenas lo tengas en la mano.
              </p>

              <button onClick={aceptarGarantia} disabled={guardandoGarantia}
                style={{ width: "100%", marginTop: 20, padding: 16, borderRadius: 16, border: "none", background: guardandoGarantia ? "#e2e8f0" : `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`, color: guardandoGarantia ? "#64748b" : "#fff", fontSize: 16, fontWeight: 800, cursor: guardandoGarantia ? "default" : "pointer" }}>
                {guardandoGarantia ? "Un momento…" : "Entiendo y continúo"}
              </button>
              <button onClick={() => { setMostrarGarantia(false); setAccionPendiente(null); }} disabled={guardandoGarantia}
                style={{ width: "100%", marginTop: 8, padding: 12, borderRadius: 14, border: "none", background: "transparent", color: THEME.muted, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                Volver a revisar la publicación
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
