"use client";
import { useState, useEffect, Fragment } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { THEME } from "@/lib/theme";
import { LAUNCH_AT_MS } from "@/lib/launch";
import { COOKIE_MODO_PRUEBA_UI } from "@/lib/modoPrueba";
import { esCuentaMaster } from "@/lib/adminAuth";

type Seccion = "resumen" | "lista" | "usuarios" | "productos" | "pagos" | "bloqueos" | "auditoria" | "urls";

// Descompone en días/horas los milisegundos que faltan para el 12. Se calcula en
// el navegador a partir de LAUNCH_AT_MS, que es una constante del código: no hace
// falta preguntarle la hora al servidor para pintar un reloj.
function faltanPara(ms: number): { dias: number; horas: number; pasado: boolean } {
  const resto = ms - Date.now();
  if (resto <= 0) return { dias: 0, horas: 0, pasado: true };
  return {
    dias: Math.floor(resto / 86400000),
    horas: Math.floor((resto % 86400000) / 3600000),
    pasado: false,
  };
}

// Enlaces que usamos en Colbisnes, agrupados. Solo URLs públicas de paneles/servicios;
// nunca credenciales ni secretos.
//
// Revisados uno por uno el 2026-07-30 con peticiones HTTP reales. Se corrigieron tres que
// ya no llevaban a donde decían (Railway cambió de dominio a railway.com; Resend movió
// /overview a /metrics; console.cloudinary.com a secas rebotaba a la página comercial en
// vez de a la consola) y se añadieron Cloudflare y Twilio, que faltaban aunque son
// justamente donde se rompen las cosas: el DNS del dominio y las notificaciones.
// Si vuelves a tocar esta lista, comprueba cada URL de verdad antes de darla por buena.
const GRUPOS_URLS: { grupo: string; enlaces: { nombre: string; url: string; nota?: string }[] }[] = [
  {
    grupo: "🛒 Sitio y panel",
    enlaces: [
      { nombre: "Sitio en producción", url: "https://colbisnes.com" },
      { nombre: "Panel de administración", url: "https://colbisnes.com/admin" },
      { nombre: "Estado del servidor", url: "https://colbisnes.com/api/health", nota: "Debe responder {\"status\":\"ok\"}; consulta la base de datos de verdad" },
      { nombre: "Salir del modo prueba", url: "https://colbisnes.com/?acceso=salir", nota: "⚠️ Si abriste el enlace de probador, los desembolsos te dan 403. Esto lo arregla." },
    ],
  },
  {
    grupo: "☁️ Infraestructura",
    enlaces: [
      { nombre: "Railway — proyecto Colbisnes", url: "https://railway.com/project/dca4dfdc-04b9-4106-8905-fbd74e28ecac", nota: "Deploys, variables y logs (enlace directo al proyecto)" },
      { nombre: "Cloudflare (DNS)", url: "https://dash.cloudflare.com", nota: "DNS de colbisnes.com y redirección de www" },
      { nombre: "Neon (base de datos)", url: "https://console.neon.tech", nota: "PostgreSQL de producción" },
      { nombre: "GitHub (repositorio)", url: "https://github.com/gustavoasanchezosorio-crypto/colbisnes-web" },
    ],
  },
  {
    grupo: "💰 Pagos",
    enlaces: [
      { nombre: "Wompi (comercios)", url: "https://comercios.wompi.co", nota: "Pagos con tarjeta / PSE · webhook y llaves de producción" },
      { nombre: "Binance P2P", url: "https://p2p.binance.com", nota: "Referencia de tasa USDT/COP" },
    ],
  },
  {
    grupo: "✉️ Correo y notificaciones",
    enlaces: [
      { nombre: "Resend — métricas", url: "https://resend.com/metrics", nota: "Envíos y logs de correo" },
      { nombre: "Resend — dominios", url: "https://resend.com/domains", nota: "Registros SPF/DKIM/DMARC de colbisnes.com" },
      { nombre: "Twilio (WhatsApp)", url: "https://console.twilio.com", nota: "⚠️ Aún en sandbox: solo entrega a números que se unieron a mano" },
    ],
  },
  {
    grupo: "🪪 Identidad y verificación",
    enlaces: [
      { nombre: "Didit (KYC)", url: "https://business.didit.me", nota: "Verificación de identidad" },
    ],
  },
  {
    grupo: "🖼️ Multimedia",
    enlaces: [
      { nombre: "Cloudinary", url: "https://console.cloudinary.com/console/", nota: "Imágenes de productos y KYC · revisar cuota" },
    ],
  },
  {
    grupo: "🔑 Autenticación",
    enlaces: [
      { nombre: "Google Cloud (OAuth)", url: "https://console.cloud.google.com/apis/credentials", nota: "Credenciales de inicio con Google" },
    ],
  },
  {
    grupo: "⛓️ Blockchain (USDT)",
    enlaces: [
      { nombre: "BscScan — wallet activa", url: "https://bscscan.com/address/0x41d4e118E45835775F3771feDb6fA2e6e4B8a3B1", nota: "Hot wallet de recepción (BEP-20)" },
      { nombre: "BscScan — contrato USDT", url: "https://bscscan.com/token/0x55d398326f99059fF775485246999027B3197955", nota: "Token BSC-USDT que verifica /api/usdt/verificar" },
    ],
  },
];

// Colores del estado en la tabla de productos del panel. Aparte porque ELIMINADO (soft-delete
// del perfil MASTER, ver DELETE en app/api/products/[id]/route.ts) necesita distinguirse de un
// producto sano — antes cualquier estado que no fuera SOLD recibía el mismo verde de
// "disponible", lo cual sería engañoso ahora que ELIMINADO puede aparecer en esta lista.
const ESTADO_PRODUCTO_COLOR: Record<string, { bg: string; fg: string }> = {
  AVAILABLE: { bg: "#dcfce7", fg: "#15803d" },
  PAYMENT_PENDING: { bg: "#fff7e6", fg: "#92660a" },
  IN_ESCROW: { bg: "#e0e7ff", fg: "#4338ca" },
  SOLD: { bg: "#fee2e2", fg: "#b91c1c" },
  ELIMINADO: { bg: "#f1f5f9", fg: "#64748b" },
};

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
  const [copiado, setCopiado] = useState<string | null>(null);
  const copiar = async (texto: string, clave: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(clave);
      setTimeout(() => setCopiado(null), 1500);
    } catch {}
  };

  // Edición master de usuarios (control total, ver memory/project_colbisnes.md). El botón que
  // dispara esto ni siquiera se pinta si no es master (más abajo), y aunque alguien forzara la
  // llamada, el servidor (PATCH /api/admin/usuarios/[id]) vuelve a exigir esCuentaMaster + 2FA
  // por su cuenta — este estado es solo para la UI, no es el candado real.
  const [editandoUsuario, setEditandoUsuario] = useState<string | null>(null);
  const [formUsuario, setFormUsuario] = useState<any>(null);
  const [cargandoFormUsuario, setCargandoFormUsuario] = useState(false);
  const [guardandoUsuario, setGuardandoUsuario] = useState(false);

  // Eliminar (soft-delete) un producto ajeno como master. Ver DELETE en
  // app/api/products/[id]/route.ts — nunca es un borrado real.
  const [eliminandoProducto, setEliminandoProducto] = useState<string | null>(null);

  // Lista de espera y estado del candado. Se cargan UNA vez al entrar, aparte del
  // resto: la franja de estado y el contador de la pestaña tienen que estar
  // visibles siempre, no solo cuando estás mirando esa sección.
  const [espera, setEspera] = useState<any>(null);
  // Se lee en el efecto, no aquí: en el render del servidor no existe `document`
  // y leerlo directamente rompería la hidratación.
  const [enModoPrueba, setEnModoPrueba] = useState(false);
  const [reloj, setReloj] = useState(() => faltanPara(LAUNCH_AT_MS));

  useEffect(() => {
    if (status === "unauthenticated") { router.push("/auth/login"); return; }
    if (status === "authenticated") { cargarDatos(seccion); }
  }, [status, seccion]);

  useEffect(() => {
    if (status !== "authenticated") return;
    // La marca del modo prueba NO es httpOnly justamente para esto: el navegador
    // puede saber por sí solo si arrastra la cookie de probador. Importa mucho en
    // el panel, porque es la causa de que los desembolsos respondan 403.
    setEnModoPrueba(document.cookie.split("; ").some(c => c === `${COOKIE_MODO_PRUEBA_UI}=1`));
    cargarEspera();
    // Refresco lento: el reloj es informativo, no necesita segundos.
    const id = setInterval(() => setReloj(faltanPara(LAUNCH_AT_MS)), 60000);
    return () => clearInterval(id);
  }, [status]);

  const cargarEspera = async () => {
    try {
      const res = await fetch("/api/admin/waitlist");
      const data = await res.json();
      if (res.ok && !data.error) setEspera(data);
    } catch {
      // Silencioso a propósito: si esto falla, la franja de estado y la pestaña
      // simplemente no se pintan. No debe tumbar el resto del panel, que es por
      // donde se mueve el dinero.
    }
  };

  const cargarDatos = async (seccionActual: Seccion) => {
    setCargando(true);
    setErrorAdmin("");
    try {
      // La sección de URLs es estática (no consulta API).
      if (seccionActual === "urls") { setDatos(null); return; }
      // La lista de espera tiene su propio estado (se carga al entrar al panel);
      // al abrir la pestaña se refresca para no mirar números viejos.
      if (seccionActual === "lista") { setDatos(null); await cargarEspera(); return; }
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
    const code = codigos2FA["kyc-" + userId];
    if (!code || code.length < 6) {
      alert("Ingresa el código de 6 dígitos de tu app autenticadora");
      return;
    }
    if (!confirm(`Aprobar verificación facial para ${nombre}?`)) return;
    try {
      const res = await fetch("/api/kyc/approve", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId, code }),
      });
      const data = await res.json();
      if (res.ok) {
        setMensaje("Usuario verificado y notificado por email");
        setTimeout(() => setMensaje(""), 4000);
        cargarDatos("usuarios");
      } else {
        alert(data.error || "Error al aprobar verificación facial");
      }
    } catch (error) {
      alert("Error de red");
    }
  };

  const handleLiberarPago = async (ordenId: string, nombre: string) => {
    // Step-up 2FA: la liberación manual ahora exige el código TOTP igual que la automática.
    const code = codigos2FA[ordenId];
    if (!code || code.length < 6) {
      alert("Ingresa el código de 6 dígitos de tu app autenticadora");
      return;
    }
    if (!confirm("Confirmas que YA enviaste el pago a " + nombre + "?")) return;
    try {
      const res = await fetch("/api/admin/liberar-pago", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ orderId: ordenId, code }),
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
    const code = codigos2FA[orderId];
    if (!code || code.length < 6) {
      alert("Ingresa el código de 6 dígitos de tu app autenticadora");
      return;
    }
    if (!confirm(`¿Confirmas que viste el pago de la comisión de reserva para "${productoTitulo}" en la cuenta Nequi de Colbisnes?`)) return;
    try {
      const res = await fetch("/api/admin/confirmar-comision-nequi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ orderId, code }),
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
    const code = codigos2FA[userId];
    if (!code || code.length < 6) {
      alert("Ingresa el código de 6 dígitos de tu app autenticadora");
      return;
    }
    const confirmText = accion === "pagar-deuda"
      ? `¿Confirmas que ${nombre} ya pagó su deuda pendiente con Colbisnes?`
      : `¿Levantar el bloqueo por tiempo de ${nombre}? (Esto NO borra la deuda pendiente si la tiene)`;
    if (!confirm(confirmText)) return;
    try {
      const res = await fetch("/api/admin/usuarios-bloqueados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId, accion, code }),
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

  // Trae el perfil completo de un usuario (la lista de la pestaña "usuarios" solo trae name/
  // email/city/role/kycStatus — nada de phone/dirección/bloqueo/deuda) y abre su panel de
  // edición master. Un solo panel abierto a la vez: abrir otro reemplaza el anterior.
  const abrirEdicionUsuario = async (userId: string) => {
    setEditandoUsuario(userId);
    setFormUsuario(null);
    setCargandoFormUsuario(true);
    try {
      const res = await fetch(`/api/admin/usuarios/${userId}`, { credentials: "include" });
      const data = await res.json();
      if (res.ok) {
        setFormUsuario(data.usuario);
      } else {
        alert(data.error || "Error al cargar el usuario");
        setEditandoUsuario(null);
      }
    } catch {
      alert("Error de red");
      setEditandoUsuario(null);
    } finally {
      setCargandoFormUsuario(false);
    }
  };

  const cerrarEdicionUsuario = () => {
    setEditandoUsuario(null);
    setFormUsuario(null);
  };

  // Envío crudo del PATCH, sin confirm(): cada acción que lo llama (guardar / desactivar /
  // reactivar) pide su propia confirmación con un mensaje específico antes de llegar aquí.
  const enviarPatchUsuario = async (userId: string, cambios: Record<string, unknown>) => {
    const code = codigos2FA["master-" + userId];
    if (!code || code.length < 6) {
      alert("Ingresa el código de 6 dígitos de tu app autenticadora");
      return;
    }
    setGuardandoUsuario(true);
    try {
      const res = await fetch(`/api/admin/usuarios/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...cambios, code }),
      });
      const data = await res.json();
      if (res.ok) {
        setMensaje("Usuario actualizado");
        setTimeout(() => setMensaje(""), 4000);
        cerrarEdicionUsuario();
        cargarDatos("usuarios");
      } else {
        alert(data.error || "Error al actualizar el usuario");
      }
    } catch {
      alert("Error de red");
    } finally {
      setGuardandoUsuario(false);
    }
  };

  const handleGuardarUsuario = (u: any) => {
    if (!formUsuario) return;
    if (!confirm(`¿Guardar los cambios del perfil de ${u.name || u.email}?`)) return;
    const cambios: Record<string, unknown> = {
      name: formUsuario.name,
      phone: formUsuario.phone,
      phoneWhatsapp: formUsuario.phoneWhatsapp,
      city: formUsuario.city,
      direccionEnvio: formUsuario.direccionEnvio,
      blockedUntil: formUsuario.blockedUntil,
      blockedReason: formUsuario.blockedReason,
      deudaPendienteCOP: Number(formUsuario.deudaPendienteCOP) || 0,
      penalizacionScorePts: Number(formUsuario.penalizacionScorePts) || 0,
    };
    // El rol de una cuenta MASTER nunca se toca desde este formulario (el selector de rol de
    // más abajo directamente no se pinta cuando formUsuario.role === "MASTER"). Esto evita tanto
    // una autodegradación accidental como el 400 que devolvería el servidor si se reenviara
    // "MASTER" tal cual — esa vía solo admite USER/ADMIN, a propósito (ver la ruta).
    if (formUsuario.role !== "MASTER") cambios.role = formUsuario.role;
    enviarPatchUsuario(u.id, cambios);
  };

  const handleDesactivarUsuario = (u: any) => {
    if (!confirm(`¿Desactivar la cuenta de ${u.name || u.email}? Queda bloqueada para comprar y vender; su historial (ventas, reseñas, mensajes) no se toca, y es reversible con "Reactivar".`)) return;
    enviarPatchUsuario(u.id, { accion: "desactivar" });
  };

  const handleReactivarUsuario = (u: any) => {
    if (!confirm(`¿Reactivar la cuenta de ${u.name || u.email}?`)) return;
    enviarPatchUsuario(u.id, { accion: "reactivar" });
  };

  const handleEliminarProducto = async (productId: string, titulo: string) => {
    if (!confirm(`¿Eliminar "${titulo}"? Se oculta del catálogo y de favoritos, pero el registro y su historial quedan intactos en la base — es reversible (no es un borrado real).`)) return;
    setEliminandoProducto(productId);
    try {
      const res = await fetch(`/api/products/${productId}`, { method: "DELETE", credentials: "include" });
      const data = await res.json();
      if (res.ok) {
        setMensaje("Producto eliminado (oculto del catálogo)");
        setTimeout(() => setMensaje(""), 4000);
        cargarDatos("productos");
      } else {
        alert(data.error || "Error al eliminar el producto");
      }
    } catch {
      alert("Error de red");
    } finally {
      setEliminandoProducto(null);
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

  // Deriva del rol que trae la sesión, no del respaldo por ADMIN_EMAIL (esa variable es
  // server-only y en el navegador siempre llega vacía — ver lib/adminAuth.ts). Es SOLO para
  // mostrar u ocultar botones; el candado real vive en el servidor, en cada ruta que este
  // panel llama (PATCH/DELETE de productos, PATCH de /api/admin/usuarios/[id]).
  const esMaster = esCuentaMaster(session);

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "sans-serif" }}>
      <header style={{ background: `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`, padding: "16px 28px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/logo-white.svg?v=2" alt="Colbisnes" style={{ height: 38, width: "auto" }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.3)", padding: "3px 10px", borderRadius: 20 }}>ADMIN</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <a href="/admin/kyc" style={{ color: "white", textDecoration: "none", fontSize: 13, fontWeight: 700, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", padding: "7px 14px", borderRadius: 20 }}>🪪 Verificación facial</a>
          <a href="/admin/disputas" style={{ color: "white", textDecoration: "none", fontSize: 13, fontWeight: 700, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", padding: "7px 14px", borderRadius: 20 }}>⚖️ Disputas</a>
          {/* 2FA estaba solo enlazado desde dentro de la sección de pagos: si no pasabas por ahí,
              no había forma de llegar. Ahora las tres subpáginas del admin están en la barra. */}
          <a href="/admin/2fa" style={{ color: "white", textDecoration: "none", fontSize: 13, fontWeight: 700, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", padding: "7px 14px", borderRadius: 20 }}>🔐 2FA</a>
          <a href="/" style={{ color: "white", textDecoration: "none", fontSize: 14 }}>← Volver al sitio</a>
        </div>
      </header>

      {/* Franja de estado del prelanzamiento.
          Responde de un vistazo las tres preguntas que antes había que ir a
          buscar a Railway o al código: ¿el candado sigue puesto?, ¿cuánto falta
          para que se abran las compras?, ¿este navegador arrastra la cookie de
          probador? La tercera es la importante: es la causa de que /liberar-pago
          devuelva 403 sin explicar por qué.

          Aquí NO se enseña nunca LAUNCH_BYPASS_CODE. El panel dice si el candado
          está puesto, no cuál es la llave. */}
      {espera && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "center", background: "#0f172a", color: "#e2e8f0", padding: "10px 24px", fontSize: 13 }}>
          <span style={{ fontWeight: 700, background: espera.candadoActivo ? "#7c2d12" : "#14532d", color: "#fff", padding: "3px 10px", borderRadius: 20 }}>
            {espera.candadoActivo ? "🔒 Candado puesto · solo entra quien tiene el enlace" : "🌐 Sitio abierto al público"}
          </span>
          <span style={{ opacity: 0.85 }}>
            {reloj.pasado
              ? "Las compras ya están abiertas"
              : `Faltan ${reloj.dias} d ${reloj.horas} h para que se abran las compras (12 ago, 10:20)`}
          </span>
          {enModoPrueba && (
            <a href="/?acceso=salir" style={{ fontWeight: 700, background: "#facc15", color: "#422006", padding: "3px 10px", borderRadius: 20, textDecoration: "none" }}>
              ⚠️ Este navegador está en modo prueba — los desembolsos te darán 403. Salir →
            </a>
          )}
        </div>
      )}

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
        {(["resumen", "lista", "usuarios", "productos", "pagos", "bloqueos", "auditoria", "urls"] as Seccion[]).map(sec => (
          <button key={sec} onClick={() => setSeccion(sec)} style={{ padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, background: seccion === sec ? T.blue : T.card, color: seccion === sec ? "white" : T.muted }}>
            {sec === "resumen" ? "📊 Resumen"
              : sec === "lista" ? `✉️ Lista de espera${espera ? ` (${espera.total})` : ""}`
              : sec === "usuarios" ? `👥 Usuarios${datos?.usuarios ? ` (${datos.usuarios.length})` : ""}`
              : sec === "productos" ? "📦 Productos"
              : sec === "pagos" ? `💰 Pagos${datos?.pagos ? ` (${datos.pagos.length})` : ""}`
              : sec === "bloqueos" ? `🔒 Contraentrega${datos?.comisionesPendientes ? ` (${datos.comisionesPendientes.length + (datos?.usuariosBloqueados?.length || 0)})` : ""}`
              : sec === "auditoria" ? "📋 Auditoría"
              : "🔗 URLs"}
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
                  // Antes del 12 esta es la única cifra que se mueve; sin ella el
                  // resumen es un tablero de ceros que no dice nada.
                  { label: "Apuntados a la lista", value: espera?.total ?? 0, color: "#8B5CF6" },
                ].map((item, i) => (
                  <div key={i} style={{ background: T.card, borderRadius: 16, padding: "24px", border: `1px solid ${T.border}`, textAlign: "center" }}>
                    <div style={{ fontSize: 36, fontWeight: 900, color: item.color }}>{item.value}</div>
                    <div style={{ color: T.muted, fontSize: 13, marginTop: 6 }}>{item.label}</div>
                  </div>
                ))}
              </div>
            )}

            {seccion === "lista" && (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16, marginBottom: 20 }}>
                  {[
                    { label: "Apuntados", value: espera?.total ?? 0, color: T.blue },
                    { label: "Últimas 24 h", value: espera?.ultimas24h ?? 0, color: T.green },
                    { label: "Ya crearon cuenta", value: espera?.conCuenta ?? 0, color: T.gold },
                    { label: "Ya publicaron", value: espera?.publicaron ?? 0, color: "#EF4444" },
                  ].map((item, i) => (
                    <div key={i} style={{ background: T.card, borderRadius: 16, padding: "24px", border: `1px solid ${T.border}`, textAlign: "center" }}>
                      <div style={{ fontSize: 36, fontWeight: 900, color: item.color }}>{item.value}</div>
                      <div style={{ color: T.muted, fontSize: 13, marginTop: 6 }}>{item.label}</div>
                    </div>
                  ))}
                </div>

                {/* El número que de verdad dice si el acceso anticipado funciona.
                    "Apuntados" solo mide la campaña; "ya crearon cuenta" mide si el
                    correo de bienvenida consigue que crucen la puerta. */}
                {espera?.total > 0 && (
                  <div style={{ background: "#eff6ff", border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: T.text }}>
                    <strong>{espera.conCuenta} de {espera.total}</strong> apuntados entraron y crearon cuenta
                    {espera.total > espera.conCuenta && (
                      <> — a <strong>{espera.total - espera.conCuenta}</strong> les llegó el enlace y no lo usaron.</>
                    )}
                  </div>
                )}

                <div style={{ background: T.card, borderRadius: 16, padding: 20, border: `1px solid ${T.border}`, overflowX: "auto" as const }}>
                  {espera?.lista?.length ? (
                    <table style={{ width: "100%", borderCollapse: "collapse" as const, fontSize: 13 }}>
                      <thead>
                        <tr style={{ textAlign: "left" as const, color: T.muted, borderBottom: `1px solid ${T.border}` }}>
                          <th style={{ padding: "8px 6px" }}>Correo</th>
                          <th style={{ padding: "8px 6px" }}>Se apuntó</th>
                          <th style={{ padding: "8px 6px" }}>Cuenta</th>
                          <th style={{ padding: "8px 6px" }}>Publicó</th>
                          <th style={{ padding: "8px 6px" }}>Correo que recibió</th>
                        </tr>
                      </thead>
                      <tbody>
                        {espera.lista.map((f: any) => {
                          // Los que se apuntaron ANTES de que se desplegara el acceso
                          // anticipado (commit 1bb7755) recibieron el correo viejo, el
                          // que no llevaba enlace de entrada. Y como /api/waitlist solo
                          // envía en el alta nueva, no se les reenvía nada nunca: hay
                          // que escribirles aparte. Por eso van marcados.
                          const conEnlace = new Date(f.createdAt).getTime() >= Date.parse("2026-08-03T01:01:28-05:00");
                          return (
                            <tr key={f.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                              <td style={{ padding: "8px 6px", wordBreak: "break-all" as const }}>{f.email}</td>
                              <td style={{ padding: "8px 6px", color: T.muted }}>{new Date(f.createdAt).toLocaleString("es-CO")}</td>
                              <td style={{ padding: "8px 6px" }}>{f.tieneCuenta ? "✅" : "—"}</td>
                              <td style={{ padding: "8px 6px" }}>{f.productos > 0 ? `✅ ${f.productos}` : "—"}</td>
                              <td style={{ padding: "8px 6px", color: conEnlace ? T.muted : "#b45309", fontWeight: conEnlace ? 400 : 700 }}>
                                {conEnlace ? "Con enlace de entrada" : "⚠️ Viejo, sin enlace"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <p style={{ color: T.muted, textAlign: "center" as const, margin: 0 }}>Todavía no hay nadie apuntado.</p>
                  )}
                </div>
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
                        {["Usuario", "Email", "Ciudad", "Estado verificación facial", "Productos", "Registro", "Acciones"].map(h => (
                          <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 700, color: T.muted, textTransform: "uppercase" as const, letterSpacing: "0.05em", borderBottom: `1px solid ${T.border}` }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {usuariosFiltrados.map((u: any) => (
                        <Fragment key={u.id}>
                        <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                          <td style={{ padding: "12px 16px", fontWeight: 600 }}>
                            {u.name || "Sin nombre"}
                            {u.role && u.role !== "USER" && (
                              <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, padding: "1px 6px", borderRadius: 8, background: u.role === "MASTER" ? "#111827" : "#e0e7ff", color: u.role === "MASTER" ? "#fbbf24" : "#4338ca" }}>
                                {u.role}
                              </span>
                            )}
                          </td>
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
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
                              {u.kycStatus !== "approved" && (
                                <>
                                  <input
                                    type="text" inputMode="numeric" maxLength={6} placeholder="2FA"
                                    value={codigos2FA["kyc-" + u.id] || ""}
                                    onChange={e => setCodigos2FA(prev => ({ ...prev, ["kyc-" + u.id]: e.target.value.replace(/\D/g, "") }))}
                                    style={{ width: 66, padding: "6px 8px", borderRadius: 8, border: "1px solid " + T.border, fontSize: 12 }}
                                  />
                                  <button onClick={() => handleApproveKyc(u.id, u.name || u.email)}
                                    style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: T.green, color: "white", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                                    ✓ Aprobar verificación facial
                                  </button>
                                </>
                              )}
                              <a href={`/user/${u.id}`} target="_blank"
                                style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", color: T.muted, fontSize: 12, textDecoration: "none", display: "inline-block" }}>
                                Ver perfil
                              </a>
                              {esMaster && (
                                <button onClick={() => editandoUsuario === u.id ? cerrarEdicionUsuario() : abrirEdicionUsuario(u.id)}
                                  style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${T.blue}`, background: editandoUsuario === u.id ? T.blue : "transparent", color: editandoUsuario === u.id ? "white" : T.blue, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                                  {editandoUsuario === u.id ? "✕ Cerrar" : "✏️ Master"}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {esMaster && editandoUsuario === u.id && (
                          <tr>
                            <td colSpan={7} style={{ padding: 0, borderBottom: `1px solid ${T.border}` }}>
                              <div style={{ background: THEME.surfaceAlt, padding: 18 }}>
                                {cargandoFormUsuario || !formUsuario ? (
                                  <p style={{ color: T.muted, margin: 0 }}>Cargando datos del usuario…</p>
                                ) : (
                                  <>
                                    <p style={{ margin: "0 0 12px", fontSize: 12.5, fontWeight: 700, color: T.blue }}>
                                      ✏️ Edición master — {formUsuario.email}
                                      {formUsuario.role === "MASTER" && (
                                        <span style={{ marginLeft: 8, color: "#b91c1c", fontWeight: 700 }}>(cuenta MASTER: el rol no se toca desde aquí)</span>
                                      )}
                                    </p>
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 12 }}>
                                      {([
                                        ["name", "Nombre"],
                                        ["phone", "Teléfono"],
                                        ["phoneWhatsapp", "WhatsApp"],
                                        ["city", "Ciudad"],
                                        ["direccionEnvio", "Dirección de envío"],
                                      ] as const).map(([campo, label]) => (
                                        <div key={campo}>
                                          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 3 }}>{label}</label>
                                          <input type="text" value={formUsuario[campo] || ""}
                                            onChange={e => setFormUsuario((prev: any) => ({ ...prev, [campo]: e.target.value }))}
                                            style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid " + T.border, fontSize: 13, boxSizing: "border-box" as const }} />
                                        </div>
                                      ))}
                                      {formUsuario.role !== "MASTER" && (
                                        <div>
                                          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 3 }}>Rol</label>
                                          <select value={formUsuario.role || "USER"}
                                            onChange={e => setFormUsuario((prev: any) => ({ ...prev, role: e.target.value }))}
                                            style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid " + T.border, fontSize: 13, boxSizing: "border-box" as const }}>
                                            <option value="USER">USER</option>
                                            <option value="ADMIN">ADMIN</option>
                                          </select>
                                        </div>
                                      )}
                                      <div>
                                        <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 3 }}>Deuda pendiente (COP)</label>
                                        <input type="number" min={0} value={formUsuario.deudaPendienteCOP ?? 0}
                                          onChange={e => setFormUsuario((prev: any) => ({ ...prev, deudaPendienteCOP: e.target.value }))}
                                          style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid " + T.border, fontSize: 13, boxSizing: "border-box" as const }} />
                                      </div>
                                      <div>
                                        <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 3 }}>Penalización (pts)</label>
                                        <input type="number" min={0} value={formUsuario.penalizacionScorePts ?? 0}
                                          onChange={e => setFormUsuario((prev: any) => ({ ...prev, penalizacionScorePts: e.target.value }))}
                                          style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid " + T.border, fontSize: 13, boxSizing: "border-box" as const }} />
                                      </div>
                                      <div>
                                        <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 3 }}>Bloqueado hasta</label>
                                        <input type="datetime-local"
                                          value={formUsuario.blockedUntil ? new Date(formUsuario.blockedUntil).toISOString().slice(0, 16) : ""}
                                          onChange={e => setFormUsuario((prev: any) => ({ ...prev, blockedUntil: e.target.value ? new Date(e.target.value).toISOString() : null }))}
                                          style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid " + T.border, fontSize: 13, boxSizing: "border-box" as const }} />
                                      </div>
                                      <div>
                                        <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 3 }}>Motivo del bloqueo</label>
                                        <input type="text" value={formUsuario.blockedReason || ""}
                                          onChange={e => setFormUsuario((prev: any) => ({ ...prev, blockedReason: e.target.value }))}
                                          style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid " + T.border, fontSize: 13, boxSizing: "border-box" as const }} />
                                      </div>
                                    </div>
                                    <p style={{ margin: "0 0 10px", fontSize: 11, color: T.muted, lineHeight: 1.4 }}>
                                      No editable aquí, a propósito: email, contraseña, 2FA, Nequi/Bre-B/USDT de cobro, y verificación KYC
                                      (esos tienen sus propios flujos). Ver el comentario en app/api/admin/usuarios/[id]/route.ts.
                                    </p>
                                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" as const }}>
                                      <input type="text" inputMode="numeric" maxLength={6} placeholder="Código 2FA"
                                        value={codigos2FA["master-" + u.id] || ""}
                                        onChange={e => setCodigos2FA(prev => ({ ...prev, ["master-" + u.id]: e.target.value.replace(/\D/g, "") }))}
                                        style={{ width: 110, padding: "8px 10px", borderRadius: 8, border: "1px solid " + T.border, fontSize: 13 }} />
                                      <button onClick={() => handleGuardarUsuario(u)} disabled={guardandoUsuario}
                                        style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: T.blue, color: "white", fontSize: 12.5, fontWeight: 700, cursor: "pointer", opacity: guardandoUsuario ? 0.6 : 1 }}>
                                        {guardandoUsuario ? "Guardando…" : "💾 Guardar cambios"}
                                      </button>
                                      {formUsuario.id !== session?.user?.id && (
                                        formUsuario.blockedUntil && new Date(formUsuario.blockedUntil) > new Date() ? (
                                          <button onClick={() => handleReactivarUsuario(formUsuario)} disabled={guardandoUsuario}
                                            style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", color: T.green, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                                            Reactivar cuenta
                                          </button>
                                        ) : (
                                          <button onClick={() => handleDesactivarUsuario(formUsuario)} disabled={guardandoUsuario}
                                            style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #fca5a5", background: "transparent", color: "#b91c1c", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                                            Desactivar cuenta
                                          </button>
                                        )
                                      )}
                                      <button onClick={cerrarEdicionUsuario}
                                        style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", color: T.muted, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                                        Cancelar
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                        </Fragment>
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
                        {["Título", "Vendedor", "Estado", "Precio", "Fecha", "Acciones"].map(h => (
                          <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 12, color: T.muted, borderBottom: `1px solid ${T.border}` }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {datos.productos.map((p: any) => (
                        <tr key={p.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                          <td style={{ padding: "10px 14px" }}>{p.title}</td>
                          <td style={{ padding: "10px 14px", color: T.muted, fontSize: 13 }}>{p.seller?.name || p.seller?.email || "—"}</td>
                          <td style={{ padding: "10px 14px" }}>
                            <span style={{ padding: "2px 8px", borderRadius: 12, background: ESTADO_PRODUCTO_COLOR[p.status]?.bg || "#f1f5f9", color: ESTADO_PRODUCTO_COLOR[p.status]?.fg || "#64748b", fontSize: 11, fontWeight: 700 }}>{p.status}</span>
                          </td>
                          <td style={{ padding: "10px 14px", color: T.green }}>${p.priceCOP?.toLocaleString("es-CO")}</td>
                          <td style={{ padding: "10px 14px", color: T.muted, fontSize: 13 }}>{new Date(p.createdAt).toLocaleDateString("es-CO")}</td>
                          <td style={{ padding: "10px 14px" }}>
                            {esMaster ? (
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
                                <a href={`/product/${p.id}/editar`} target="_blank"
                                  style={{ padding: "5px 12px", borderRadius: 8, border: `1px solid ${T.blue}`, color: T.blue, fontSize: 12, fontWeight: 700, textDecoration: "none", display: "inline-block" }}>
                                  ✏️ Editar
                                </a>
                                {p.status !== "ELIMINADO" && (
                                  <button onClick={() => handleEliminarProducto(p.id, p.title)} disabled={eliminandoProducto === p.id}
                                    style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid #fca5a5", background: "transparent", color: "#b91c1c", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: eliminandoProducto === p.id ? 0.6 : 1 }}>
                                    {eliminandoProducto === p.id ? "…" : "🗑️ Eliminar"}
                                  </button>
                                )}
                              </div>
                            ) : "—"}
                          </td>
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
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 20, background: "#fff7e6", color: "#92660a", fontSize: 12, fontWeight: 700 }}>
                            {p.metodoPago === "USDT_BEP20" ? (p.totalUSDT + " USDT") : ("$" + Number(p.recibeVendedor).toLocaleString("es-CO") + " COP")}
                            <button title="Copiar monto" onClick={() => copiar(p.metodoPago === "USDT_BEP20" ? String(p.totalUSDT) : String(p.recibeVendedor), p.ordenId + "-monto")}
                              style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 12, padding: 0 }}>
                              {copiado === p.ordenId + "-monto" ? "✓" : "📋"}
                            </button>
                          </span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13, color: T.muted, marginBottom: 14 }}>
                          {p.vendedorUsdtWallet && <p style={{ margin: 0, display: "flex", alignItems: "center", gap: 6 }}>USDT: {p.vendedorUsdtWallet} ({p.vendedorUsdtRed}) <button title="Copiar wallet" onClick={() => copiar(p.vendedorUsdtWallet, p.ordenId + "-usdt")} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 12, padding: 0 }}>{copiado === p.ordenId + "-usdt" ? "✓" : "📋"}</button></p>}
                          {p.vendedorNequi && <p style={{ margin: 0, display: "flex", alignItems: "center", gap: 6 }}>Nequi: {p.vendedorNequi} <button title="Copiar Nequi" onClick={() => copiar(p.vendedorNequi, p.ordenId + "-nequi")} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 12, padding: 0 }}>{copiado === p.ordenId + "-nequi" ? "✓" : "📋"}</button></p>}
                          {p.vendedorBreb && <p style={{ margin: 0, display: "flex", alignItems: "center", gap: 6 }}>Bre-B: {p.vendedorBreb} <button title="Copiar Bre-B" onClick={() => copiar(p.vendedorBreb, p.ordenId + "-breb")} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 12, padding: 0 }}>{copiado === p.ordenId + "-breb" ? "✓" : "📋"}</button></p>}
                          {p.vendedorWhatsapp && <p style={{ margin: 0 }}>WhatsApp: {p.vendedorWhatsapp}</p>}
                        </div>
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
                          {p.metodoPago === "USDT_BEP20" && p.vendedorUsdtWallet && (
                            <button onClick={() => handleLiberarPagoAuto(p.ordenId, p.vendedorNombre)}
                              disabled={enviandoAuto === p.ordenId}
                              style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: T.blue, color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: enviandoAuto === p.ordenId ? 0.6 : 1 }}>
                              {enviandoAuto === p.ordenId ? "Enviando..." : "🤖 Aprobar y enviar automático"}
                            </button>
                          )}
                          <button onClick={() => handleLiberarPago(p.ordenId, p.vendedorNombre)}
                            style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: T.green, color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                            ✓ Ya envie el pago (manual)
                          </button>
                        </div>
                        <p style={{ margin: "6px 0 0", fontSize: 11, color: "#b91c1c", fontWeight: 600 }}>
                          ⚠️ Este botón NO transfiere dinero: solo marca la orden como pagada y le avisa al vendedor (correo + WhatsApp) que ya le transferiste. Úsalo únicamente después de haber enviado tú mismo el dinero al Nequi/Bre-B/USDT del vendedor.
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
                              <p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: o.productoEstado !== "PAYMENT_PENDING" ? 700 : 400, color: o.productoEstado !== "PAYMENT_PENDING" ? "#b91c1c" : T.muted }}>
                                Estado del producto: {o.productoEstado || "—"}
                                {o.productoEstado !== "PAYMENT_PENDING" && " ⚠️ inesperado — verifica manualmente antes de confirmar"}
                              </p>
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
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" as const }}>
                            <input
                              type="text" inputMode="numeric" maxLength={6} placeholder="Código 2FA"
                              value={codigos2FA[o.id] || ""}
                              onChange={e => setCodigos2FA(prev => ({ ...prev, [o.id]: e.target.value.replace(/\D/g, "") }))}
                              style={{ width: 110, padding: "8px 10px", borderRadius: 8, border: "1px solid " + T.border, fontSize: 13 }}
                            />
                            <button onClick={() => handleConfirmarComision(o.id, o.productoTitulo)}
                              style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: T.green, color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                              ✓ Confirmar pago recibido
                            </button>
                          </div>
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
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, alignItems: "center" }}>
                              {(u.deudaPendienteCOP > 0 || bloqueadoPorTiempo) && (
                                <input
                                  type="text" inputMode="numeric" maxLength={6} placeholder="Código 2FA"
                                  value={codigos2FA[u.id] || ""}
                                  onChange={e => setCodigos2FA(prev => ({ ...prev, [u.id]: e.target.value.replace(/\D/g, "") }))}
                                  style={{ width: 110, padding: "8px 10px", borderRadius: 8, border: "1px solid " + T.border, fontSize: 13 }}
                                />
                              )}
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

            {seccion === "urls" && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
                {GRUPOS_URLS.map(({ grupo, enlaces }) => (
                  <div key={grupo} style={{ background: T.card, borderRadius: 16, padding: 20, border: `1px solid ${T.border}` }}>
                    <h3 style={{ margin: "0 0 14px", color: T.blue, fontSize: 15 }}>{grupo}</h3>
                    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                      {enlaces.map(({ nombre, url, nota }) => (
                        <li key={url}>
                          <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: T.text, textDecoration: "none", fontWeight: 700, fontSize: 14, display: "block" }}>
                            {nombre} <span style={{ fontSize: 12 }}>↗</span>
                          </a>
                          <div style={{ fontSize: 11, color: T.muted, wordBreak: "break-all", marginTop: 2 }}>{url}</div>
                          {nota && <div style={{ fontSize: 11, color: T.muted, marginTop: 2, fontStyle: "italic" }}>{nota}</div>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
