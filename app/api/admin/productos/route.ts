import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { esAdminSession } from "@/lib/adminAuth";

// Esta es la ruta que alimenta la pestaña "Productos" del panel admin (ver cargarDatos en
// app/admin/page.tsx). Sin esto, el master podía editar un producto y, al volver a esta pestaña,
// seguir viendo el precio/estado viejo — exactamente el síntoma reportado de "edito y no se
// refleja". Igual que el resto de rutas admin — ver el comentario en
// app/api/admin/usuarios/[id]/route.ts.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !esAdminSession(session)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    const productos = await prisma.product.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        title: true,
        status: true,
        priceCOP: true,
        city: true,
        createdAt: true,
        seller: { select: { name: true, email: true } },
      },
    });
    return NextResponse.json({ productos }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
