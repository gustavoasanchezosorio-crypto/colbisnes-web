import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { esAdminSession } from "@/lib/adminAuth";

// Esta es la ruta que alimenta la pestaña "Usuarios" del panel admin (ver cargarDatos en
// app/admin/page.tsx) — la lista, distinta del detalle de un usuario en [id]/route.ts. Mismo
// motivo que el resto de rutas admin — ver el comentario en app/api/admin/usuarios/[id]/route.ts.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !esAdminSession(session)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    const usuarios = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true, name: true, email: true, city: true,
        role: true, kycStatus: true, createdAt: true,
        _count: { select: { products: true } },
      },
    });
    return NextResponse.json({ usuarios }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
