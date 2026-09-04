import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/audit";
import { verificarCodigoTOTP } from "@/lib/totp";
import { esAdminSession } from "@/lib/adminAuth";

// Ruta genérica ?seccion=X, hoy sin llamador en el frontend (las pestañas usan las rutas
// dedicadas /api/admin/resumen, /productos, /usuarios, /auditoria), pero sigue viva y
// respondiendo si alguien la llama directo. Mismo motivo que el resto de rutas admin — ver el
// comentario en app/api/admin/usuarios/[id]/route.ts.
export const dynamic = "force-dynamic";
const NO_STORE = { headers: { "Cache-Control": "no-store, max-age=0" } };

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !esAdminSession(session)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const seccion = searchParams.get("seccion") || "resumen";

    if (seccion === "resumen") {
      const [totalUsuarios, totalProductos, productosVendidos, productosActivos, totalOfertas, ofertasAceptadas, totalReviews] = await Promise.all([
        prisma.user.count(),
        prisma.product.count(),
        prisma.product.count({ where: { status: "SOLD" } }),
        prisma.product.count({ where: { status: "AVAILABLE" } }),
        prisma.offer.count(),
        prisma.offer.count({ where: { status: "ACCEPTED" } }),
        prisma.review.count(),
      ]);

      const hace7dias = new Date();
      hace7dias.setDate(hace7dias.getDate() - 7);
      const [usuariosNuevos, productosNuevos] = await Promise.all([
        prisma.user.count({ where: { createdAt: { gte: hace7dias } } }),
        prisma.product.count({ where: { createdAt: { gte: hace7dias } } }),
      ]);

      return NextResponse.json(
        {
          totalUsuarios, totalProductos, productosVendidos, productosActivos,
          totalOfertas, ofertasAceptadas, totalReviews, usuariosNuevos, productosNuevos,
          tasaConversion: totalProductos > 0 ? ((productosVendidos / totalProductos) * 100).toFixed(1) : "0",
        },
        NO_STORE
      );
    }

    if (seccion === "usuarios") {
      const usuarios = await prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true, name: true, email: true, city: true, role: true, createdAt: true,
          _count: { select: { products: true, receivedReviews: true } },
        },
      });
      return NextResponse.json({ usuarios }, NO_STORE);
    }

    if (seccion === "productos") {
      const productos = await prisma.product.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          seller: { select: { name: true, email: true } },
          images: { take: 1 },
        },
      });
      return NextResponse.json({ productos }, NO_STORE);
    }

    if (seccion === "auditoria") {
      const logs = await prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { user: { select: { name: true, email: true } } },
      });
      return NextResponse.json({ logs }, NO_STORE);
    }

    return NextResponse.json({ error: "Sección no válida" }, { status: 400 });
  } catch (error: any) {
    console.error("Error admin API:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !session.user.id || !esAdminSession(session)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { accion, id, code } = await req.json();
    if (!code) return NextResponse.json({ error: "Falta el código 2FA" }, { status: 400 });

    // Step-up 2FA: eliminar (desactivar) un producto es una acción destructiva de admin,
    // así que exige un código TOTP vigente igual que las demás acciones sensibles.
    const admin = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!admin?.totpEnabled || !admin.totpSecret) {
      return NextResponse.json({ error: "El 2FA no está activado. Configúralo en /admin/2fa" }, { status: 400 });
    }
    if (!(await verificarCodigoTOTP(admin.totpSecret, code))) {
      return NextResponse.json({ error: "Código de verificación inválido" }, { status: 401 });
    }

    if (accion === "eliminar_producto") {
      await prisma.product.update({ where: { id }, data: { status: "SOLD" } });
      await registrarAuditoria({
        userId: session.user.id,
        action: "ELIMINAR_PRODUCTO",
        entity: "Product",
        entityId: id,
        request: req,
      });
      return NextResponse.json({ success: true, mensaje: "Producto desactivado" });
    }

    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
