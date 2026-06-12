import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function esAdmin(email: string) {
  return email?.toLowerCase() === process.env.ADMIN_EMAIL?.toLowerCase();
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

      return NextResponse.json({
        totalUsuarios, totalProductos, productosVendidos, productosActivos,
        totalOfertas, ofertasAceptadas, totalReviews, usuariosNuevos, productosNuevos,
        tasaConversion: totalProductos > 0 ? ((productosVendidos / totalProductos) * 100).toFixed(1) : "0",
      });
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
      return NextResponse.json({ usuarios });
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
      return NextResponse.json({ productos });
    }

    if (seccion === "auditoria") {
      const logs = await prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { user: { select: { name: true, email: true } } },
      });
      return NextResponse.json({ logs });
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
    if (!session?.user?.email || !esAdmin(session.user.email)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { accion, id } = await req.json();

    if (accion === "eliminar_producto") {
      await prisma.product.update({ where: { id }, data: { status: "SOLD" } });
      return NextResponse.json({ success: true, mensaje: "Producto desactivado" });
    }

    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
