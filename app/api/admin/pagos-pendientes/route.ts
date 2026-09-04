import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { esAdminSession } from "@/lib/adminAuth";

// Sin esto el navegador puede servir un listado viejo de pagos pendientes: una orden que ya se
// liberó por otra vía (ej. liberar-pago-auto) seguiría apareciendo aquí como pendiente. El intento
// de liberarla de nuevo lo rechaza igual /api/admin/liberar-pago (ya relee pagoLiberado en el
// momento y devuelve 409 si ya se liberó — no hay doble pago posible), pero el admin no debería
// perder tiempo mirando una cola que no es la real. Igual que el resto de rutas admin — ver el
// comentario en app/api/admin/usuarios/[id]/route.ts.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!esAdminSession(session)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const [ordenes, ordenesEnCustodia] = await Promise.all([
      prisma.order.findMany({
        where: { estado: "COMPLETADO", pagoLiberado: false },
        orderBy: { createdAt: "desc" },
      }),
      prisma.order.findMany({
        where: { estado: { in: ["PAGADO", "ESPERANDO_ENVIO", "EN_CAMINO", "ENTREGADO"] }, pagoLiberado: false },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    // Batch-fetch all products and sellers to avoid N+1
    const productIds = [...new Set([...ordenes, ...ordenesEnCustodia].map((o) => o.productId))];
    const productos = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        title: true,
        sellerId: true,
        seller: {
          select: {
            name: true,
            email: true,
            phoneWhatsapp: true,
            usdtWallet: true,
            usdtRed: true,
            nequiNumber: true,
            brebId: true,
          },
        },
      },
    });

    const productoMap = new Map(productos.map((p) => [p.id, p]));

    const resultado = ordenes.map((o) => {
      const producto = productoMap.get(o.productId);
      const vendedor = producto?.seller;
      return {
        ordenId: o.id,
        productoTitulo: producto?.title || "Producto eliminado",
        metodoPago: o.metodoPago,
        recibeVendedor: o.recibeVendedor,
        totalUSDT: o.totalUSDT,
        vendedorNombre: vendedor?.name || "Sin nombre",
        vendedorEmail: vendedor?.email || "",
        vendedorWhatsapp: vendedor?.phoneWhatsapp || "",
        vendedorUsdtWallet: vendedor?.usdtWallet || "",
        vendedorUsdtRed: vendedor?.usdtRed || "",
        vendedorNequi: vendedor?.nequiNumber || "",
        vendedorBreb: vendedor?.brebId || "",
      };
    });

    const labelEstadoOrden: Record<string, string> = {
      PAGADO: "Pago confirmado, aún no despachado",
      ESPERANDO_ENVIO: "Esperando que el vendedor envíe",
      EN_CAMINO: "En camino",
      ENTREGADO: "Entregado, esperando confirmación del comprador",
    };

    const enCustodia = ordenesEnCustodia.map((o) => {
      const producto = productoMap.get(o.productId);
      const vendedor = producto?.seller;
      return {
        ordenId: o.id,
        productoTitulo: producto?.title || "Producto eliminado",
        metodoPago: o.metodoPago,
        recibeVendedor: o.recibeVendedor,
        totalUSDT: o.totalUSDT,
        buyerEmail: o.buyerEmail,
        vendedorNombre: vendedor?.name || "Sin nombre",
        vendedorEmail: vendedor?.email || "",
        estado: o.estado,
        estadoLabel: labelEstadoOrden[o.estado] || o.estado,
      };
    });

    return NextResponse.json({ pagos: resultado, enCustodia }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
