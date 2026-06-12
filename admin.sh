#!/bin/bash

# ============================================================
#  COLBISNES - Panel de Administración
#  Uso: bash admin.sh
# ============================================================

set -e

AZUL='\033[0;34m'
VERDE='\033[0;32m'
ROJO='\033[0;31m'
AMARILLO='\033[1;33m'
NC='\033[0m'

PROJECT_DIR="$HOME/Desktop/colbisnes/colbisnes-web"

echo ""
echo -e "${AZUL}╔══════════════════════════════════════════════╗${NC}"
echo -e "${AZUL}║   COLBISNES — Panel de Administración        ║${NC}"
echo -e "${AZUL}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ── Verificar carpeta ─────────────────────────────────────────────────────────
if [ ! -f "$PROJECT_DIR/package.json" ]; then
  echo -e "${ROJO}❌ No se encontró el proyecto en $PROJECT_DIR${NC}"
  exit 1
fi

cd "$PROJECT_DIR"
echo -e "${VERDE}✅ Proyecto encontrado en $PROJECT_DIR${NC}"
echo ""

# ── PASO 1: Agregar variable ADMIN al .env ────────────────────────────────────
echo -e "${AMARILLO}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${AMARILLO}  PASO 1: Configurando acceso de administrador${NC}"
echo -e "${AMARILLO}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

echo ""
echo -e "${AZUL}¿Cuál es tu email de administrador?${NC}"
echo -e "(El email con el que te registraste en Colbisnes)"
read -r ADMIN_EMAIL

if [ -z "$ADMIN_EMAIL" ]; then
  echo -e "${ROJO}❌ Debes ingresar un email${NC}"
  exit 1
fi

# Eliminar si ya existe
grep -v "^ADMIN_EMAIL=" .env > .env.tmp && mv .env.tmp .env

echo "" >> .env
echo "# Panel de Administración" >> .env
echo "ADMIN_EMAIL=\"${ADMIN_EMAIL}\"" >> .env

echo -e "${VERDE}✅ Admin configurado: ${ADMIN_EMAIL}${NC}"

# ── PASO 2: Crear API del admin ───────────────────────────────────────────────
echo ""
echo -e "${AMARILLO}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${AMARILLO}  PASO 2: Creando APIs del panel admin${NC}"
echo -e "${AMARILLO}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

mkdir -p app/api/admin

cat > app/api/admin/route.ts << 'EOF'
// app/api/admin/route.ts — API principal del panel admin
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

function esAdmin(email: string) {
  return email === process.env.ADMIN_EMAIL;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !esAdmin(session.user.email)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const seccion = searchParams.get("seccion") || "resumen";

    if (seccion === "resumen") {
      const [
        totalUsuarios,
        totalProductos,
        productosVendidos,
        productosActivos,
        totalOfertas,
        ofertasAceptadas,
        totalReviews,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.product.count(),
        prisma.product.count({ where: { status: "SOLD" } }),
        prisma.product.count({ where: { status: "AVAILABLE" } }),
        prisma.offer.count(),
        prisma.offer.count({ where: { status: "ACCEPTED" } }),
        prisma.review.count(),
      ]);

      // Usuarios nuevos últimos 7 días
      const hace7dias = new Date();
      hace7dias.setDate(hace7dias.getDate() - 7);
      const usuariosNuevos = await prisma.user.count({
        where: { createdAt: { gte: hace7dias } },
      });

      // Productos nuevos últimos 7 días
      const productosNuevos = await prisma.product.count({
        where: { createdAt: { gte: hace7dias } },
      });

      return NextResponse.json({
        totalUsuarios,
        totalProductos,
        productosVendidos,
        productosActivos,
        totalOfertas,
        ofertasAceptadas,
        totalReviews,
        usuariosNuevos,
        productosNuevos,
        tasaConversion: totalProductos > 0
          ? ((productosVendidos / totalProductos) * 100).toFixed(1)
          : "0",
      });
    }

    if (seccion === "usuarios") {
      const usuarios = await prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          name: true,
          email: true,
          city: true,
          isVerified: true,
          createdAt: true,
          _count: {
            select: { products: true, reviewsReceived: true },
          },
        },
      });
      return NextResponse.json({ usuarios });
    }

    if (seccion === "productos") {
      const productos = await prisma.product.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          user: { select: { name: true, email: true } },
          images: { take: 1 },
        },
      });
      return NextResponse.json({ productos });
    }

    if (seccion === "auditoria") {
      const logs = await prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          user: { select: { name: true, email: true } },
        },
      });
      return NextResponse.json({ logs });
    }

    return NextResponse.json({ error: "Sección no válida" }, { status: 400 });
  } catch (error: any) {
    console.error("Error admin API:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Acciones del admin (suspender usuario, eliminar producto)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !esAdmin(session.user.email)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { accion, id } = await req.json();

    if (accion === "eliminar_producto") {
      await prisma.product.update({
        where: { id },
        data: { status: "SOLD" },
      });
      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: "ADMIN_PRODUCTO_ELIMINADO",
          details: `Admin eliminó producto ${id}`,
        } as any,
      });
      return NextResponse.json({ success: true, mensaje: "Producto desactivado" });
    }

    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
EOF

echo -e "${VERDE}✅ API admin creada${NC}"

# ── PASO 3: Crear página del panel admin ──────────────────────────────────────
echo ""
echo -e "${AMARILLO}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${AMARILLO}  PASO 3: Creando página del panel admin${NC}"
echo -e "${AMARILLO}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

mkdir -p app/admin

cat > app/admin/page.tsx << 'EOF'
// app/admin/page.tsx — Panel de Administración Colbisnes
"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL;

type Seccion = "resumen" | "usuarios" | "productos" | "auditoria";

export default function AdminPanel() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [seccion, setSeccion] = useState<Seccion>("resumen");
  const [datos, setDatos] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin");
      return;
    }
    if (status === "authenticated") {
      cargarDatos(seccion);
    }
  }, [status, seccion]);

  const cargarDatos = async (sec: Seccion) => {
    setCargando(true);
    try {
      const res = await fetch(`/api/admin?seccion=${sec}`);
      if (res.status === 403) {
        router.push("/");
        return;
      }
      const data = await res.json();
      setDatos(data);
    } catch (e) {
      console.error(e);
    } finally {
      setCargando(false);
    }
  };

  const accionAdmin = async (accion: string, id: string) => {
    if (!confirm("¿Estás seguro de esta acción?")) return;
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion, id }),
      });
      const data = await res.json();
      setMensaje(data.mensaje || "Acción ejecutada");
      setTimeout(() => setMensaje(""), 3000);
      cargarDatos(seccion);
    } catch (e) {
      setMensaje("Error al ejecutar acción");
    }
  };

  const s = {
    container: { minHeight: "100vh", backgroundColor: "#0a0a1a", color: "white", fontFamily: "sans-serif" },
    header: { backgroundColor: "#00589F", padding: "1rem 2rem", display: "flex", justifyContent: "space-between", alignItems: "center" },
    titulo: { fontSize: "1.5rem", fontWeight: "bold", color: "#D4AF37" },
    nav: { display: "flex", gap: "0.5rem", padding: "1rem 2rem", backgroundColor: "#111", borderBottom: "1px solid #222" },
    navBtn: (activo: boolean) => ({
      padding: "0.5rem 1.2rem", borderRadius: "6px", border: "none", cursor: "pointer",
      backgroundColor: activo ? "#00589F" : "#222", color: activo ? "white" : "#aaa", fontWeight: activo ? "bold" : "normal",
    }),
    contenido: { padding: "2rem" },
    grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "2rem" },
    card: { backgroundColor: "#111", border: "1px solid #222", borderRadius: "10px", padding: "1.5rem", textAlign: "center" as const },
    cardNum: { fontSize: "2.5rem", fontWeight: "bold", color: "#D4AF37" },
    cardLabel: { color: "#aaa", fontSize: "0.9rem", marginTop: "0.3rem" },
    tabla: { width: "100%", borderCollapse: "collapse" as const, backgroundColor: "#111", borderRadius: "8px", overflow: "hidden" },
    th: { backgroundColor: "#00589F", padding: "0.8rem", textAlign: "left" as const, fontSize: "0.85rem" },
    td: { padding: "0.8rem", borderBottom: "1px solid #222", fontSize: "0.85rem" },
    badge: (color: string) => ({ backgroundColor: color, padding: "0.2rem 0.6rem", borderRadius: "4px", fontSize: "0.75rem", color: "white" }),
    btnDanger: { backgroundColor: "#ff4444", color: "white", border: "none", padding: "0.3rem 0.8rem", borderRadius: "4px", cursor: "pointer", fontSize: "0.8rem" },
    mensaje: { backgroundColor: "#00589F", color: "white", padding: "0.8rem 1.5rem", borderRadius: "6px", marginBottom: "1rem" },
  };

  const colorEstado: any = {
    AVAILABLE: "#00aa44", PAYMENT_PENDING: "#ff9900", IN_ESCROW: "#8B4FDB", SOLD: "#555",
  };

  if (status === "loading") return <div style={{ ...s.container, display: "flex", alignItems: "center", justifyContent: "center" }}><p>Cargando...</p></div>;

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <span style={s.titulo}>⚙️ Panel Admin — Colbisnes</span>
        <span style={{ color: "#ccc", fontSize: "0.9rem" }}>{session?.user?.email}</span>
      </div>

      {/* Navegación */}
      <div style={s.nav}>
        {(["resumen", "usuarios", "productos", "auditoria"] as Seccion[]).map((sec) => (
          <button key={sec} style={s.navBtn(seccion === sec)} onClick={() => setSeccion(sec)}>
            {sec === "resumen" && "📊 Resumen"}
            {sec === "usuarios" && "👥 Usuarios"}
            {sec === "productos" && "📦 Productos"}
            {sec === "auditoria" && "📋 Auditoría"}
          </button>
        ))}
      </div>

      {/* Contenido */}
      <div style={s.contenido}>
        {mensaje && <div style={s.mensaje}>✅ {mensaje}</div>}

        {cargando ? (
          <p style={{ color: "#aaa", textAlign: "center", padding: "3rem" }}>⏳ Cargando datos...</p>
        ) : (
          <>
            {/* RESUMEN */}
            {seccion === "resumen" && datos && (
              <>
                <h2 style={{ color: "#D4AF37", marginBottom: "1.5rem" }}>📊 Resumen General</h2>
                <div style={s.grid}>
                  <div style={s.card}><div style={s.cardNum}>{datos.totalUsuarios}</div><div style={s.cardLabel}>Total Usuarios</div></div>
                  <div style={s.card}><div style={{ ...s.cardNum, color: "#00aa44" }}>{datos.usuariosNuevos}</div><div style={s.cardLabel}>Nuevos (7 días)</div></div>
                  <div style={s.card}><div style={s.cardNum}>{datos.totalProductos}</div><div style={s.cardLabel}>Total Productos</div></div>
                  <div style={s.card}><div style={{ ...s.cardNum, color: "#00aa44" }}>{datos.productosActivos}</div><div style={s.cardLabel}>Activos</div></div>
                  <div style={s.card}><div style={{ ...s.cardNum, color: "#8B4FDB" }}>{datos.productosVendidos}</div><div style={s.cardLabel}>Vendidos</div></div>
                  <div style={s.card}><div style={s.cardNum}>{datos.totalOfertas}</div><div style={s.cardLabel}>Total Ofertas</div></div>
                  <div style={s.card}><div style={{ ...s.cardNum, color: "#00aa44" }}>{datos.ofertasAceptadas}</div><div style={s.cardLabel}>Ofertas Aceptadas</div></div>
                  <div style={s.card}><div style={{ ...s.cardNum, color: "#D4AF37" }}>{datos.tasaConversion}%</div><div style={s.cardLabel}>Tasa de Conversión</div></div>
                  <div style={s.card}><div style={s.cardNum}>{datos.totalReviews}</div><div style={s.cardLabel}>Reseñas</div></div>
                </div>
                <div style={{ backgroundColor: "#111", border: "1px solid #222", borderRadius: "10px", padding: "1.5rem" }}>
                  <h3 style={{ color: "#D4AF37", marginBottom: "1rem" }}>📈 Actividad últimos 7 días</h3>
                  <p style={{ color: "#ccc" }}>👤 <strong style={{ color: "white" }}>{datos.usuariosNuevos}</strong> usuarios nuevos</p>
                  <p style={{ color: "#ccc", marginTop: "0.5rem" }}>📦 <strong style={{ color: "white" }}>{datos.productosNuevos}</strong> productos nuevos</p>
                </div>
              </>
            )}

            {/* USUARIOS */}
            {seccion === "usuarios" && datos?.usuarios && (
              <>
                <h2 style={{ color: "#D4AF37", marginBottom: "1.5rem" }}>👥 Usuarios ({datos.usuarios.length})</h2>
                <div style={{ overflowX: "auto" }}>
                  <table style={s.tabla}>
                    <thead>
                      <tr>
                        <th style={s.th}>Nombre</th>
                        <th style={s.th}>Email</th>
                        <th style={s.th}>Ciudad</th>
                        <th style={s.th}>Verificado</th>
                        <th style={s.th}>Productos</th>
                        <th style={s.th}>Reseñas</th>
                        <th style={s.th}>Registro</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datos.usuarios.map((u: any) => (
                        <tr key={u.id}>
                          <td style={s.td}>{u.name || "—"}</td>
                          <td style={s.td}>{u.email}</td>
                          <td style={s.td}>{u.city || "—"}</td>
                          <td style={s.td}>
                            {u.isVerified
                              ? <span style={s.badge("#00aa44")}>✓ Verificado</span>
                              : <span style={s.badge("#555")}>Sin verificar</span>}
                          </td>
                          <td style={{ ...s.td, textAlign: "center" }}>{u._count.products}</td>
                          <td style={{ ...s.td, textAlign: "center" }}>{u._count.reviewsReceived}</td>
                          <td style={s.td}>{new Date(u.createdAt).toLocaleDateString("es-CO")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* PRODUCTOS */}
            {seccion === "productos" && datos?.productos && (
              <>
                <h2 style={{ color: "#D4AF37", marginBottom: "1.5rem" }}>📦 Productos ({datos.productos.length})</h2>
                <div style={{ overflowX: "auto" }}>
                  <table style={s.tabla}>
                    <thead>
                      <tr>
                        <th style={s.th}>Título</th>
                        <th style={s.th}>Vendedor</th>
                        <th style={s.th}>Precio</th>
                        <th style={s.th}>Estado</th>
                        <th style={s.th}>Ciudad</th>
                        <th style={s.th}>Fecha</th>
                        <th style={s.th}>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datos.productos.map((p: any) => (
                        <tr key={p.id}>
                          <td style={s.td}>{p.title}</td>
                          <td style={s.td}>{p.user?.name || p.user?.email || "—"}</td>
                          <td style={s.td}>${Number(p.price).toLocaleString("es-CO")}</td>
                          <td style={s.td}>
                            <span style={s.badge(colorEstado[p.status] || "#555")}>{p.status}</span>
                          </td>
                          <td style={s.td}>{p.city || "—"}</td>
                          <td style={s.td}>{new Date(p.createdAt).toLocaleDateString("es-CO")}</td>
                          <td style={s.td}>
                            {p.status !== "SOLD" && (
                              <button style={s.btnDanger} onClick={() => accionAdmin("eliminar_producto", p.id)}>
                                Desactivar
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* AUDITORÍA */}
            {seccion === "auditoria" && datos?.logs && (
              <>
                <h2 style={{ color: "#D4AF37", marginBottom: "1.5rem" }}>📋 Log de Auditoría ({datos.logs.length})</h2>
                <div style={{ overflowX: "auto" }}>
                  <table style={s.tabla}>
                    <thead>
                      <tr>
                        <th style={s.th}>Fecha</th>
                        <th style={s.th}>Usuario</th>
                        <th style={s.th}>Acción</th>
                        <th style={s.th}>Detalles</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datos.logs.map((log: any) => (
                        <tr key={log.id}>
                          <td style={s.td}>{new Date(log.createdAt).toLocaleString("es-CO")}</td>
                          <td style={s.td}>{log.user?.name || log.user?.email || "Sistema"}</td>
                          <td style={s.td}><span style={s.badge("#00589F")}>{log.action}</span></td>
                          <td style={{ ...s.td, maxWidth: "300px", overflow: "hidden", textOverflow: "ellipsis" }}>{log.details}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
EOF

echo -e "${VERDE}✅ Página admin creada en app/admin/page.tsx${NC}"

# ── PASO 4: Agregar NEXT_PUBLIC_ADMIN_EMAIL al .env ───────────────────────────
grep -v "^NEXT_PUBLIC_ADMIN_EMAIL=" .env > .env.tmp && mv .env.tmp .env
echo "NEXT_PUBLIC_ADMIN_EMAIL=\"${ADMIN_EMAIL}\"" >> .env
echo -e "${VERDE}✅ Variable pública de admin agregada${NC}"

# ── ÉXITO ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${VERDE}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${VERDE}║   ✅ PANEL ADMIN CREADO EXITOSAMENTE             ║${NC}"
echo -e "${VERDE}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo "  Archivos creados:"
echo "    • app/admin/page.tsx        (panel visual)"
echo "    • app/api/admin/route.ts    (API protegida)"
echo ""
echo "  Para usar el panel:"
echo "    1. Ejecuta:  npm run dev"
echo "    2. Abre:     http://localhost:3006/admin"
echo "    3. Inicia sesión con: ${ADMIN_EMAIL}"
echo ""
echo "  El panel tiene 4 secciones:"
echo "    📊 Resumen   — métricas generales"
echo "    👥 Usuarios  — lista de todos los usuarios"
echo "    📦 Productos — gestión de publicaciones"
echo "    📋 Auditoría — log de acciones"
echo ""
echo -e "${AZUL}  Solo tú (${ADMIN_EMAIL}) puedes acceder al panel 🔒${NC}"
echo ""
