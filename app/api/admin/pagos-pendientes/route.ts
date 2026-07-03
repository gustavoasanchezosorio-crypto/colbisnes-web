import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

function esAdmin(session: { user?: { email?: string | null; role?: string | null } } | null) {
  if (!session?.user) return false;
  return (
    session.user.role === "ADMIN" ||
    session.user.email?.toLowerCase() === process.env.ADMIN_EMAIL?.toLowerCase()
  );
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!esAdmin(session)) {
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

    return NextResponse.json({ pagos: resultado, enCustodia });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
