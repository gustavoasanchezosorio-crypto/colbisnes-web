import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { esAdminSession } from "@/lib/adminAuth";

// Alimenta la pestaña "Resumen" (la que ve el master al entrar al panel). Igual que el resto
// de rutas admin — ver el comentario en app/api/admin/usuarios/[id]/route.ts.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !esAdminSession(session)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    const [totalUsuarios, totalProductos, totalOfertas, totalVentas] = await Promise.all([
      prisma.user.count(),
      prisma.product.count(),
      prisma.offer.count(),
      prisma.product.count({ where: { status: "SOLD" } }),
    ]);
    return NextResponse.json(
      { totalUsuarios, totalProductos, totalOfertas, totalVentas },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
