import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcularPrecioOnline } from "@/lib/pricing";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.redirect(new URL("/login", req.url));

  const productoId = req.nextUrl.searchParams.get("productoId");
  if (!productoId) return NextResponse.json({ error: "productoId requerido" }, { status: 400 });

  const producto = await prisma.product.findUnique({ where: { id: productoId } });
  if (!producto) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

  const pricing = calcularPrecioOnline(producto.priceCOP);

  const orden = await prisma.order.create({
    data: {
      productId:      producto.id,
      buyerEmail:     session.user.email,
      metodoPago:     "ONLINE",
      estado:         "PENDIENTE",
      totalPagado:    pricing.totalComprador,
      comision:       pricing.comisionColbisnes,
      recibeVendedor: pricing.recibeVendedor,
    },
  });

  const ref      = `colbisnes-${orden.id}`;
  const amount   = pricing.totalComprador * 100;
  const currency = "COP";
  const secret   = process.env.WOMPI_INTEGRITY_SECRET!;
  const firma    = crypto.createHash("sha256").update(`${ref}${amount}${currency}${secret}`).digest("hex");

  const params = new URLSearchParams({
    "public-key":      process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY!,
    currency,
    "amount-in-cents": String(amount),
    reference:         ref,
    signature:         firma,
    "redirect-url":    `${process.env.NEXT_PUBLIC_URL}/checkout/confirmacion?orderId=${orden.id}`,
  });

  return NextResponse.redirect(`https://checkout.wompi.co/p/?${params.toString()}`);
}
