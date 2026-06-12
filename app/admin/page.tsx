"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

type Seccion = "resumen" | "usuarios" | "productos" | "auditoria";

export default function AdminPanel() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [seccion, setSeccion] = useState<Seccion>("resumen");
  const [datos, setDatos] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") { router.push("/auth/login"); return; }
    if (status === "authenticated") { cargarDatos(seccion); }
  }, [status, seccion]);

  const cargarDatos = async (seccionActual: Seccion) => {
    setCargando(true);
    try {
      const res = await fetch(`/api/admin/${seccionActual}`);
      const data = await res.json();
      setDatos(data);
    } catch (error) {
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

  const usuariosFiltrados = datos?.usuarios?.filter((u: any) =>
    u.name?.toLowerCase().includes(busqueda.toLowerCase()) ||
    u.email?.toLowerCase().includes(busqueda.toLowerCase())
  ) || [];

  const T = {
    bg: "#0a0a1a", card: "#111827", border: "#1f2937",
    blue: "#1F6BFF", green: "#10B981", gold: "#D4AF37",
    text: "white", muted: "#9CA3AF",
  };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "sans-serif" }}>
      <header style={{ background: "#00589F", padding: "16px 28px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 20, fontWeight: 900, color: T.gold, letterSpacing: "0.05em" }}>COLBISNES — Admin</span>
        <a href="/" style={{ color: "white", textDecoration: "none", fontSize: 14 }}>← Volver al sitio</a>
      </header>

      {mensaje && (
        <div style={{ background: "#065F46", color: "#D1FAE5", padding: "12px 24px", textAlign: "center", fontWeight: 600 }}>
          ✅ {mensaje}
        </div>
      )}

      <nav style={{ display: "flex", gap: 8, padding: "16px 24px", borderBottom: `1px solid ${T.border}` }}>
        {(["resumen", "usuarios", "productos", "auditoria"] as Seccion[]).map(sec => (
          <button key={sec} onClick={() => setSeccion(sec)} style={{ padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, background: seccion === sec ? T.blue : T.card, color: seccion === sec ? "white" : T.muted }}>
            {sec === "resumen" ? "📊 Resumen" : sec === "usuarios" ? `👥 Usuarios${datos?.usuarios ? ` (${datos.usuarios.length})` : ""}` : sec === "productos" ? "📦 Productos" : "📋 Auditoría"}
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
                              ? <span style={{ padding: "3px 10px", borderRadius: 20, background: "#065F46", color: "#D1FAE5", fontSize: 12, fontWeight: 700 }}>✓ Verificado</span>
                              : <span style={{ padding: "3px 10px", borderRadius: 20, background: "#374151", color: T.muted, fontSize: 12 }}>Sin verificar</span>}
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
                <h2 style={{ margin: "0 0 16px", color: T.gold }}>Productos</h2>
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
                          <td style={{ padding: "10px 14px" }}><span style={{ padding: "2px 8px", borderRadius: 12, background: p.status === "SOLD" ? "#7F1D1D" : "#065F46", color: "white", fontSize: 11 }}>{p.status}</span></td>
                          <td style={{ padding: "10px 14px", color: T.green }}>${p.priceCOP?.toLocaleString("es-CO")}</td>
                          <td style={{ padding: "10px 14px", color: T.muted, fontSize: 13 }}>{new Date(p.createdAt).toLocaleDateString("es-CO")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p style={{ color: T.muted }}>No hay productos</p>}
              </div>
            )}

            {seccion === "auditoria" && (
              <div style={{ background: T.card, borderRadius: 16, padding: 24, border: `1px solid ${T.border}` }}>
                <h2 style={{ margin: "0 0 16px", color: T.gold }}>Auditoría</h2>
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
