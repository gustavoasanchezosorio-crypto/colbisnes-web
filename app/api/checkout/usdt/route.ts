import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcularPrecioUSDT } from "@/lib/pricing";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { productoId, tasaCOP } = await req.json();
  const producto = await prisma.product.findUnique({ where: { id: productoId } });
  if (!producto) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

  const pricing = calcularPrecioUSDT(producto.price, tasaCOP);

  const orden = await prisma.order.create({
    data: {
      productId:      producto.id,
      buyerEmail:     session.user.email,
      metodoPago:     "USDT_BEP20",
      estado:         "ESPERANDO_PAGO_CRYPTO",
      totalPagado:    Math.round(pricing.totalUSD * tasaCOP),
      comision:       Math.round(pricing.comisionUSD * tasaCOP),
      recibeVendedor: producto.price,
      totalUSDT:      pricing.totalUSD,
    },
  });

  return NextResponse.json({ ok: true, ordenId: orden.id, totalUSDT: pricing.totalUSD, wallet: pricing.wallet, red: pricing.red });
}
