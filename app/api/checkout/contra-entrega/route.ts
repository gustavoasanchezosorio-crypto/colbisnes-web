import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcularPrecioContraEntrega } from "@/lib/pricing";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { productoId } = await req.json();
  const producto = await prisma.product.findUnique({ where: { id: productoId } });
  if (!producto) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

  const pricing       = calcularPrecioContraEntrega(producto.priceCOP);
  const codigoSecreto = Math.floor(100000 + Math.random() * 900000).toString();

  const orden = await prisma.order.create({
    data: {
      productId:      producto.id,
      buyerEmail:     session.user.email,
      metodoPago:     "CONTRA_ENTREGA",
      estado:         "ESPERANDO_ENVIO",
      totalPagado:    pricing.totalComprador,
      comision:       pricing.comisionColbisnes,
      recibeVendedor: pricing.recibeVendedor,
      codigoSecreto,
    },
  });

  return NextResponse.json({ ok: true, ordenId: orden.id });
}
