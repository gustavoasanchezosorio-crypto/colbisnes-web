import { NextRequest, NextResponse } from "next/server";
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

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !esAdminSession(session)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    // sellerId: lo usa el botón "📦 Ver publicaciones" de la pestaña "Usuarios" (ver
    // verPublicacionesDeUsuario en app/admin/page.tsx). Antes de esto, esta ruta era la ÚNICA
    // forma de ver las publicaciones de alguien desde admin, pero sin filtro por vendedor y
    // topada en las últimas 200 del sitio entero — un vendedor con publicaciones viejas
    // quedaba fuera de esa ventana y no había forma de encontrarlo sin su título de memoria.
    // Sigue siendo el mismo endpoint sin status filter (incluye ELIMINADO): "control absoluto"
    // significa ver TODO lo que ese usuario publicó, no solo lo que sigue visible al público.
    const sellerId = req.nextUrl.searchParams.get("sellerId") || undefined;
    const productos = await prisma.product.findMany({
      where: sellerId ? { sellerId } : undefined,
      orderBy: { createdAt: "desc" },
      // Sin filtro seguimos topando en 200 (vista general del sitio, no hace falta más).
      // Filtrando por un solo vendedor subimos el techo — sigue acotado, pero uno solo no
      // debería tener cientos de publicaciones reales.
      take: sellerId ? 500 : 200,
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
