"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { THEME } from "@/lib/theme";

type Seccion = "resumen" | "usuarios" | "productos" | "pagos" | "bloqueos" | "auditoria";

export default function AdminPanel() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [seccion, setSeccion] = useState<Seccion>("resumen");
  const [datos, setDatos] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [errorAdmin, setErrorAdmin] = useState("");
  const [codigos2FA, setCodigos2FA] = useState<Record<string, string>>({});
  const [enviandoAuto, setEnviandoAuto] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") { router.push("/auth/login"); return; }
    if (status === "authenticated") { cargarDatos(seccion); }
  }, [status, seccion]);

  const cargarDatos = async (seccionActual: Seccion) => {
    setCargando(true);
    setErrorAdmin("");
    try {
      if (seccionActual === "bloqueos") {
        const [resComisiones, resUsuarios] = await Promise.all([
          fetch("/api/admin/confirmar-comision-nequi"),
          fetch("/api/admin/usuarios-bloqueados"),
        ]);
        const [dataComisiones, dataUsuarios] = await Promise.all([resComisiones.json(), resUsuarios.json()]);
        if (!resComisiones.ok || !resUsuarios.ok) {
          setErrorAdmin(`Error al cargar datos de bloqueos — verifica que hayas iniciado sesión con la cuenta de administrador.`);
          setDatos(null);
        } else {
          setDatos({ comisionesPendientes: dataComisiones.ordenes || [], usuariosBloqueados: dataUsuarios.usuarios || [] });
        }
        return;
      }
      const endpoint = seccionActual === "pagos" ? "pagos-pendientes" : seccionActual;
      const res = await fetch(`/api/admin/${endpoint}`);
      const data = await res.json();
      if (!res.ok) {
        setErrorAdmin(`Error ${res.status}: ${data.error || "No autorizado"} — verifica que hayas iniciado sesión con la cuenta de administrador.`);
        setDatos(null);
      } else {
        setDatos(data);
      }
    } catch (error) {
      setErrorAdmin("Error de red al cargar datos admin");
      console.error(error);
    } finally {
      setCargando(false);
    }
  };

  const handleApproveKyc = async (userId: string, nombre: string) => {
    if (!confirm(`Aprobar KYC para ${nombre}?`)) return;
    try {
      const res = await fetch("/api/kyc/approve", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (res.ok) {
        setMensaje("Usuario verificado y notificado por email");
        setTimeout(() => setMensaje(""), 4000);
        cargarDatos("usuarios");
      } else {
        alert(data.error || "Error al aprobar KYC");
      }
    } catch (error) {
      alert("Error de red");
    }
  };

  const handleLiberarPago = async (ordenId: string, nombre: string) => {
    if (!confirm("Confirmas que YA enviaste el pago a " + nombre + "?")) return;
    try {
      const res = await fetch("/api/admin/liberar-pago", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ orderId: ordenId }),
      });
      const data = await res.json();
      if (res.ok) {
        setMensaje("Pago marcado como liberado");
        setTimeout(() => setMensaje(""), 4000);
        cargarDatos("pagos");
      } else {
        alert(data.error || "Error al liberar pago");
      }
    } catch (error) {
      alert("Error de red");
    }
  };

  const handleLiberarPagoAuto = async (ordenId: string, nombre: string) => {
    const code = codigos2FA[ordenId];
    if (!code || code.length < 6) {
      alert("Ingresa el código de 6 dígitos de tu app autenticadora");
      return;
    }
    if (!confirm(`¿Enviar automáticamente el pago en USDT a ${nombre} desde la hot wallet?`)) return;
    setEnviandoAuto(ordenId);
    try {
      const res = await fetch("/api/admin/liberar-pago-auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ orderId: ordenId, code }),
      });
      const data = await res.json();
      if (res.ok) {
        setMensaje(`✅ Enviado automáticamente: ${data.amountUSD} USDT (tx: ${data.txHash.slice(0, 10)}...)`);
        setTimeout(() => setMensaje(""), 6000);
        cargarDatos("pagos");
      } else {
        alert(data.error || "Error al enviar el pago automático");
      }
    } catch (error) {
      alert("Error de red");
    } finally {
      setEnviandoAuto(null);
    }
  };

  const handleConfirmarComision = async (orderId: string, productoTitulo: string) => {
    if (!confirm(`¿Confirmas que viste el pago de la comisión de reserva para "${productoTitulo}" en la cuenta Nequi de Colbisnes?`)) return;
    try {
      const res = await fetch("/api/admin/confirmar-comision-nequi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ orderId }),
      });
      const data = await res.json();
      if (res.ok) {
        setMensaje("Comisión confirmada, el vendedor ya puede despachar");
        setTimeout(() => setMensaje(""), 4000);
        cargarDatos("bloqueos");
      } else {
        alert(data.error || "Error al confirmar la comisión");
      }
    } catch (error) {
      alert("Error de red");
    }
  };

  const handleAccionBloqueo = async (userId: string, nombre: string, accion: "pagar-deuda" | "levantar-bloqueo") => {
    const confirmText = accion === "pagar-deuda"
      ? `¿Confirmas que ${nombre} ya pagó su deuda pendiente con Colbisnes?`
      : `¿Levantar el bloqueo por tiempo de ${nombre}? (Esto NO borra la deuda pendiente si la tiene)`;
    if (!confirm(confirmText)) return;
    try {
      const res = await fetch("/api/admin/usuarios-bloqueados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId, accion }),
      });
      const data = await res.json();
      if (res.ok) {
        setMensaje(data.mensaje || "Actualizado correctamente");
        setTimeout(() => setMensaje(""), 4000);
        cargarDatos("bloqueos");
      } else {
        alert(data.error || "Error al actualizar el usuario");
      }
    } catch (error) {
      alert("Error de red");
    }
  };

  const usuariosFiltrados = datos?.usuarios?.filter((u: any) =>
    u.name?.toLowerCase().includes(busqueda.toLowerCase()) ||
    u.email?.toLowerCase().includes(busqueda.toLowerCase())
  ) || [];

  const T = {
    bg: THEME.background, card: "#ffffff", border: THEME.border,
    blue: THEME.primary, green: "#10B981", gold: THEME.gold,
    text: THEME.text, muted: THEME.muted,
  };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "sans-serif" }}>
      <header style={{ background: `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`, padding: "16px 28px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/logo-white.svg?v=2" alt="Colbisnes" style={{ height: 38, width: "auto" }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.3)", padding: "3px 10px", borderRadius: 20 }}>ADMIN</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <a href="/admin/kyc" style={{ color: "white", textDecoration: "none", fontSize: 13, fontWeight: 700, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", padding: "7px 14px", borderRadius: 20 }}>🪪 KYC</a>
          <a href="/admin/disputas" style={{ color: "white", textDecoration: "none", fontSize: 13, fontWeight: 700, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", padding: "7px 14px", borderRadius: 20 }}>⚖️ Disputas</a>
          <a href="/" style={{ color: "white", textDecoration: "none", fontSize: 14 }}>← Volver al sitio</a>
        </div>
      </header>

      {mensaje && (
        <div style={{ background: "#dcfce7", color: "#15803d", padding: "12px 24px", textAlign: "center", fontWeight: 600 }}>
          ✅ {mensaje}
        </div>
      )}
      {errorAdmin && (
        <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "12px 24px", textAlign: "center", fontWeight: 600 }}>
          ❌ {errorAdmin}
        </div>
      )}

      <nav style={{ display: "flex", gap: 8, padding: "16px 24px", borderBottom: `1px solid ${T.border}` }}>
        {(["resumen", "usuarios", "productos", "pagos", "bloqueos", "auditoria"] as Seccion[]).map(sec => (
          <button key={sec} onClick={() => setSeccion(sec)} style={{ padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, background: seccion === sec ? T.blue : T.card, color: seccion === sec ? "white" : T.muted }}>
            {sec === "resumen" ? "📊 Resumen"
              : sec === "usuarios" ? `👥 Usuarios${datos?.usuarios ? ` (${datos.usuarios.length})` : ""}`
              : sec === "productos" ? "📦 Productos"
              : sec === "pagos" ? `💰 Pagos${datos?.pagos ? ` (${datos.pagos.length})` : ""}`
              : sec === "bloqueos" ? `🔒 Contraentrega${datos?.comisionesPendientes ? ` (${datos.comisionesPendientes.length + (datos?.usuariosBloqueados?.length || 0)})` : ""}`
              : "📋 Auditoría"}
          </button>
        ))}
      </nav>

      <main style={{ padding: "24px", maxWidth: 1200, margin: "0 auto" }}>
        {cargando ? (
          <div style={{ textAlign: "center", padding: "60px", color: T.muted }}>Cargando...</div>
        ) : (
          <>
            {seccion === "resumen" && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
                {[
                  { label: "Total usuarios", value: datos?.totalUsuarios || 0, color: T.green },
                  { label: "Productos", value: datos?.totalProductos || 0, color: T.blue },
                  { label: "Ofertas", value: datos?.totalOfertas || 0, color: T.gold },
                  { label: "Ventas", value: datos?.totalVentas || 0, color: "#EF4444" },
                ].map((item, i) => (
                  <div key={i} style={{ background: T.card, borderRadius: 16, padding: "24px", border: `1px solid ${T.border}`, textAlign: "center" }}>
                    <div style={{ fontSize: 36, fontWeight: 900, color: item.color }}>{item.value}</div>
                    <div style={{ color: T.muted, fontSize: 13, marginTop: 6 }}>{item.label}</div>
                  </div>
                ))}
              </div>
            )}

            {seccion === "usuarios" && (
              <div>
                <input type="text" placeholder="Buscar por nombre o email..." value={busqueda} onChange={e => setBusqueda(e.target.value)}
                  style={{ width: "100%", padding: "10px 16px", borderRadius: 10, border: `1px solid ${T.border}`, background: T.card, color: T.text, fontSize: 14, marginBottom: 16, boxSizing: "border-box" as const }} />
                <div style={{ overflowX: "auto" as const }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" as const }}>
                    <thead>
                      <tr style={{ background: T.card }}>
                        {["Usuario", "Email", "Ciudad", "Estado KYC", "Productos", "Registro", "Acciones"].map(h => (
                          <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 700, color: T.muted, textTransform: "uppercase" as const, letterSpacing: "0.05em", borderBottom: `1px solid ${T.border}` }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {usuariosFiltrados.map((u: any) => (
                        <tr key={u.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                          <td style={{ padding: "12px 16px", fontWeight: 600 }}>{u.name || "Sin nombre"}</td>
                          <td style={{ padding: "12px 16px", color: T.muted, fontSize: 13 }}>{u.email}</td>
                          <td style={{ padding: "12px 16px", color: T.muted }}>{u.city || "—"}</td>
                          <td style={{ padding: "12px 16px" }}>
                            {u.kycStatus === "approved"
                              ? <span style={{ padding: "3px 10px", borderRadius: 20, background: "#dcfce7", color: "#15803d", fontSize: 12, fontWeight: 700 }}>✓ Verificado</span>
                              : <span style={{ padding: "3px 10px", borderRadius: 20, background: THEME.surfaceAlt, color: T.muted, fontSize: 12 }}>Sin verificar</span>}
                          </td>
                          <td style={{ padding: "12px 16px", textAlign: "center" as const }}>{u._count?.products || 0}</td>
                          <td style={{ padding: "12px 16px", color: T.muted, fontSize: 13 }}>{new Date(u.createdAt).toLocaleDateString("es-CO")}</td>
                          <td style={{ padding: "12px 16px" }}>
                            <div style={{ display: "flex", gap: 6 }}>
                              {u.kycStatus !== "approved" && (
                                <button onClick={() => handleApproveKyc(u.id, u.name || u.email)}
                                  style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: T.green, color: "white", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                                  ✓ Aprobar KYC
                                </button>
                              )}
                              <a href={`/user/${u.id}`} target="_blank"
                                style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", color: T.muted, fontSize: 12, textDecoration: "none", display: "inline-block" }}>
                                Ver perfil
                              </a>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {seccion === "productos" && (
              <div style={{ background: T.card, borderRadius: 16, padding: 24, border: `1px solid ${T.border}` }}>
                <h2 style={{ margin: "0 0 16px", color: T.gold, textAlign: "center" }}>Productos</h2>
                {datos?.productos?.length ? (
                  <table style={{ width: "100%", borderCollapse: "collapse" as const }}>
                    <thead>
                      <tr>
                        {["Título", "Vendedor", "Estado", "Precio", "Fecha"].map(h => (
                          <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 12, color: T.muted, borderBottom: `1px solid ${T.border}` }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {datos.productos.map((p: any) => (
                        <tr key={p.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                          <td style={{ padding: "10px 14px" }}>{p.title}</td>
                          <td style={{ padding: "10px 14px", color: T.muted, fontSize: 13 }}>{p.seller?.name || p.seller?.email || "—"}</td>
                          <td style={{ padding: "10px 14px" }}><span style={{ padding: "2px 8px", borderRadius: 12, background: p.status === "SOLD" ? "#fee2e2" : "#dcfce7", color: p.status === "SOLD" ? "#b91c1c" : "#15803d", fontSize: 11, fontWeight: 700 }}>{p.status}</span></td>
                          <td style={{ padding: "10px 14px", color: T.green }}>${p.priceCOP?.toLocaleString("es-CO")}</td>
                          <td style={{ padding: "10px 14px", color: T.muted, fontSize: 13 }}>{new Date(p.createdAt).toLocaleDateString("es-CO")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p style={{ color: T.muted }}>No hay productos</p>}
              </div>
            )}

            {seccion === "pagos" && (
              <div style={{ background: T.card, borderRadius: 16, padding: 24, border: "1px solid " + T.border }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 16, gap: 6 }}>
                  <h2 style={{ margin: 0, color: T.gold, textAlign: "center" }}>Pagos pendientes de liberar</h2>
                  <a href="/admin/2fa" style={{ fontSize: 12.5, fontWeight: 700, color: T.blue, textDecoration: "none" }}>⚙️ Configurar 2FA (envíos automáticos)</a>
                </div>
                {datos?.pagos?.length ? (
                  <div style={{ display: "grid", gap: 16 }}>
                    {datos.pagos.map((p: any) => (
                      <div key={p.ordenId} style={{ background: THEME.surfaceAlt, borderRadius: 12, padding: 18, border: "1px solid " + T.border }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                          <div>
                            <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: T.text }}>{p.productoTitulo}</p>
                            <p style={{ margin: "2px 0 0", color: T.muted, fontSize: 13 }}>Vendedor: {p.vendedorNombre} ({p.vendedorEmail})</p>
                          </div>
                          <span style={{ padding: "4px 12px", borderRadius: 20, background: "#fff7e6", color: "#92660a", fontSize: 12, fontWeight: 700 }}>
                            {p.metodoPago === "USDT_BEP20" ? (p.totalUSDT + " USDT") : ("$" + Number(p.recibeVendedor).toLocaleString("es-CO") + " COP")}
                          </span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13, color: T.muted, marginBottom: 14 }}>
                          {p.vendedorUsdtWallet && <p style={{ margin: 0 }}>USDT: {p.vendedorUsdtWallet} ({p.vendedorUsdtRed})</p>}
                          {p.vendedorNequi && <p style={{ margin: 0 }}>Nequi: {p.vendedorNequi}</p>}
                          {p.vendedorBreb && <p style={{ margin: 0 }}>Bre-B: {p.vendedorBreb}</p>}
                          {p.vendedorWhatsapp && <p style={{ margin: 0 }}>WhatsApp: {p.vendedorWhatsapp}</p>}
                        </div>
                        {p.metodoPago === "USDT_BEP20" && p.vendedorUsdtWallet && (
                          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
                            <input
                              type="text"
                              inputMode="numeric"
                              maxLength={6}
                              placeholder="Código 2FA"
                              value={codigos2FA[p.ordenId] || ""}
                              onChange={e => setCodigos2FA(prev => ({ ...prev, [p.ordenId]: e.target.value.replace(/\D/g, "") }))}
                              style={{ width: 110, padding: "8px 10px", borderRadius: 8, border: "1px solid " + T.border, fontSize: 13 }}
                            />
                            <button onClick={() => handleLiberarPagoAuto(p.ordenId, p.vendedorNombre)}
                              disabled={enviandoAuto === p.ordenId}
                              style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: T.blue, color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: enviandoAuto === p.ordenId ? 0.6 : 1 }}>
                              {enviandoAuto === p.ordenId ? "Enviando..." : "🤖 Aprobar y enviar automático"}
                            </button>
                          </div>
                        )}
                        <button onClick={() => handleLiberarPago(p.ordenId, p.vendedorNombre)}
                          style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: T.green, color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                          ✓ Ya envie el pago (manual)
                        </button>
                        <p style={{ margin: "6px 0 0", fontSize: 11, color: "#b91c1c", fontWeight: 600 }}>
                          ⚠️ Este botón NO transfiere dinero, solo marca la orden como pagada en el sistema. Úsalo únicamente si ya enviaste tú mismo el USDT/dinero al vendedor por fuera de Colbisnes.
                        </p>
                      </div>
                    ))}
                  </div>
                ) : <p style={{ color: T.muted }}>No hay pagos pendientes de liberar 🎉</p>}
              </div>
            )}

            {seccion === "pagos" && (
              <div style={{ background: T.card, borderRadius: 16, padding: 24, border: "1px solid " + T.border, marginTop: 20 }}>
                <h2 style={{ margin: "0 0 4px", color: T.blue, textAlign: "center" }}>Dinero en custodia (aún no listo para liberar)</h2>
                <p style={{ margin: "0 0 16px", color: T.muted, fontSize: 12.5, textAlign: "center" }}>
                  Pagos ya confirmados que Colbisnes está reteniendo, pero que todavía no llegan a la etapa de "listo para liberar" porque falta el envío o la confirmación de entrega.
                </p>
                {datos?.enCustodia?.length ? (
                  <div style={{ display: "grid", gap: 12 }}>
                    {datos.enCustodia.map((p: any) => (
                      <div key={p.ordenId} style={{ background: THEME.surfaceAlt, borderRadius: 12, padding: 16, border: "1px solid " + T.border }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                          <div>
                            <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: T.text }}>{p.productoTitulo}</p>
                            <p style={{ margin: "2px 0 0", color: T.muted, fontSize: 12.5 }}>Vendedor: {p.vendedorNombre} ({p.vendedorEmail})</p>
                            <p style={{ margin: "2px 0 0", color: T.muted, fontSize: 12.5 }}>Comprador: {p.buyerEmail}</p>
                          </div>
                          <span style={{ padding: "4px 12px", borderRadius: 20, background: "#e6f0ff", color: T.blue, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
                            {p.metodoPago === "USDT_BEP20" ? (p.totalUSDT + " USDT") : ("$" + Number(p.recibeVendedor).toLocaleString("es-CO") + " COP")}
                          </span>
                        </div>
                        <span style={{ display: "inline-block", marginTop: 10, padding: "4px 10px", borderRadius: 20, background: "#fff7e6", color: "#92660a", fontSize: 11.5, fontWeight: 700 }}>
                          {p.estadoLabel}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : <p style={{ color: T.muted }}>No hay dinero en custodia en este momento</p>}
              </div>
            )}

            {seccion === "bloqueos" && (
              <>
                <div style={{ background: T.card, borderRadius: 16, padding: 24, border: "1px solid " + T.border }}>
                  <h2 style={{ margin: "0 0 4px", color: T.gold, textAlign: "center" }}>💜 Comisiones Nequi pendientes de confirmar</h2>
                  <p style={{ margin: "0 0 16px", color: T.muted, fontSize: 12.5, textAlign: "center" }}>
                    El comprador ya subió el comprobante de transferencia. Verifica en la cuenta Nequi de Colbisnes que el dinero haya llegado antes de confirmar — solo así el vendedor podrá despachar.
                  </p>
                  {datos?.comisionesPendientes?.length ? (
                    <div style={{ display: "grid", gap: 16 }}>
                      {datos.comisionesPendientes.map((o: any) => (
                        <div key={o.id} style={{ background: THEME.surfaceAlt, borderRadius: 12, padding: 18, border: "1px solid " + T.border }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, gap: 10, flexWrap: "wrap" as const }}>
                            <div>
                              <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: T.text }}>{o.productoTitulo}</p>
                              <p style={{ margin: "2px 0 0", color: T.muted, fontSize: 13 }}>Vendedor: {o.vendedorNombre}</p>
                              <p style={{ margin: "2px 0 0", color: T.muted, fontSize: 13 }}>Comprador: {o.buyerEmail}</p>
                              <p style={{ margin: "2px 0 0", color: T.muted, fontSize: 13 }}>Referencia: <strong>{o.comisionReservaReferencia || "—"}</strong></p>
                            </div>
                            <span style={{ padding: "4px 12px", borderRadius: 20, background: "#f3e8ff", color: "#7c3aed", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" as const }}>
                              ${Number(o.comisionReservaCOP || 0).toLocaleString("es-CO")} COP
                            </span>
                          </div>
                          {o.comisionReservaComprobanteUrl && (
                            <a href={o.comisionReservaComprobanteUrl} target="_blank" rel="noopener noreferrer" style={{ display: "block", marginBottom: 12 }}>
                              <img src={o.comisionReservaComprobanteUrl} alt="comprobante" style={{ maxWidth: 220, maxHeight: 220, borderRadius: 10, border: "1px solid " + T.border, objectFit: "cover" as const }} />
                            </a>
                          )}
                          <p style={{ margin: "0 0 10px", color: T.muted, fontSize: 11.5 }}>Subido: {new Date(o.createdAt).toLocaleString("es-CO")}</p>
                          <button onClick={() => handleConfirmarComision(o.id, o.productoTitulo)}
                            style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: T.green, color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                            ✓ Confirmar pago recibido
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : <p style={{ color: T.muted, textAlign: "center" as const }}>No hay comisiones pendientes de confirmar 🎉</p>}
                </div>

                <div style={{ background: T.card, borderRadius: 16, padding: 24, border: "1px solid " + T.border, marginTop: 20 }}>
                  <h2 style={{ margin: "0 0 4px", color: "#b91c1c", textAlign: "center" }}>🔒 Usuarios bloqueados / con deuda pendiente</h2>
                  <p style={{ margin: "0 0 16px", color: T.muted, fontSize: 12.5, textAlign: "center" }}>
                    Vendedores que no despacharon a tiempo en contraentrega. Quedan bloqueados para vender y comprar hasta que paguen la deuda pendiente y se cumpla el tiempo de bloqueo.
                  </p>
                  {datos?.usuariosBloqueados?.length ? (
                    <div style={{ display: "grid", gap: 14 }}>
                      {datos.usuariosBloqueados.map((u: any) => {
                        const bloqueadoPorTiempo = u.blockedUntil && new Date(u.blockedUntil) > new Date();
                        return (
                          <div key={u.id} style={{ background: THEME.surfaceAlt, borderRadius: 12, padding: 16, border: "1px solid " + T.border }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" as const, marginBottom: 10 }}>
                              <div>
                                <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: T.text }}>{u.name || "Sin nombre"}</p>
                                <p style={{ margin: "2px 0 0", color: T.muted, fontSize: 12.5 }}>{u.email}{u.phone ? ` · ${u.phone}` : ""}</p>
                                {u.blockedReason && <p style={{ margin: "4px 0 0", color: "#b91c1c", fontSize: 12.5 }}>{u.blockedReason}</p>}
                              </div>
                              <div style={{ display: "flex", flexDirection: "column" as const, gap: 4, alignItems: "flex-end" }}>
                                {u.deudaPendienteCOP > 0 && (
                                  <span style={{ padding: "4px 12px", borderRadius: 20, background: "#fee2e2", color: "#b91c1c", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" as const }}>
                                    Deuda: ${Number(u.deudaPendienteCOP).toLocaleString("es-CO")}
                                  </span>
                                )}
                                {u.penalizacionScorePts > 0 && (
                                  <span style={{ padding: "4px 12px", borderRadius: 20, background: "#fff7e6", color: "#92660a", fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap" as const }}>
                                    -{u.penalizacionScorePts} pts puntaje
                                  </span>
                                )}
                              </div>
                            </div>
                            {bloqueadoPorTiempo && (
                              <p style={{ margin: "0 0 10px", color: T.muted, fontSize: 12.5 }}>⏰ Bloqueado hasta: {new Date(u.blockedUntil).toLocaleString("es-CO")}</p>
                            )}
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
                              {u.deudaPendienteCOP > 0 && (
                                <button onClick={() => handleAccionBloqueo(u.id, u.name || u.email, "pagar-deuda")}
                                  style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: T.green, color: "white", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                                  ✓ Marcar deuda pagada
                                </button>
                              )}
                              {bloqueadoPorTiempo && (
                                <button onClick={() => handleAccionBloqueo(u.id, u.name || u.email, "levantar-bloqueo")}
                                  style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", color: T.muted, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                                  Levantar bloqueo por tiempo
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : <p style={{ color: T.muted, textAlign: "center" as const }}>No hay usuarios bloqueados 🎉</p>}
                </div>
              </>
            )}

            {seccion === "auditoria" && (
              <div style={{ background: T.card, borderRadius: 16, padding: 24, border: `1px solid ${T.border}` }}>
                <h2 style={{ margin: "0 0 16px", color: T.gold, textAlign: "center" }}>Auditoría</h2>
                {datos?.logs?.length ? (
                  <ul style={{ listStyle: "none", padding: 0 }}>
                    {datos.logs.map((log: any) => (
                      <li key={log.id} style={{ padding: "10px 0", borderBottom: `1px solid ${T.border}`, fontSize: 13, color: T.muted }}>
                        {log.action} — {log.user?.name || log.user?.email} — {new Date(log.createdAt).toLocaleString("es-CO")}
                      </li>
                    ))}
                  </ul>
                ) : <p style={{ color: T.muted }}>No hay registros</p>}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
