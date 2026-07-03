import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function esAdmin(session: any) {
  return session?.user?.role === "ADMIN" || session?.user?.email?.toLowerCase() === process.env.ADMIN_EMAIL?.toLowerCase();
}
function _unused(email: string) {
  return false;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !esAdmin(session)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    // Build audit log from recent orders, KYC requests, and registrations
    const [recentOrders, recentUsers, recentOffers] = await Promise.all([
      prisma.order.findMany({
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          estado: true,
          createdAt: true,
          buyerEmail: true,
          productId: true,
        },
      }),
      prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, name: true, email: true, createdAt: true, kycStatus: true },
      }),
      prisma.offer.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          status: true,
          amountCOP: true,
          createdAt: true,
          user: { select: { name: true, email: true } },
          product: { select: { title: true } },
        },
      }),
    ]);

    // Fetch product titles for orders
    const orderProductIds = [...new Set(recentOrders.map(o => o.productId))];
    const orderProducts = await prisma.product.findMany({
      where: { id: { in: orderProductIds } },
      select: { id: true, title: true },
    });
    const productTitleMap = new Map(orderProducts.map(p => [p.id, p.title]));

    const logs = [
      ...recentOrders.map(o => ({
        id: `order-${o.id}`,
        action: `Orden ${o.estado}: "${productTitleMap.get(o.productId) || o.productId}" — comprador: ${o.buyerEmail}`,
        createdAt: o.createdAt,
        user: { name: o.buyerEmail, email: o.buyerEmail },
      })),
      ...recentUsers.map(u => ({
        id: `user-${u.id}`,
        action: `Registro nuevo usuario${u.kycStatus === "approved" ? " (KYC aprobado)" : ""}`,
        createdAt: u.createdAt,
        user: { name: u.name, email: u.email },
      })),
      ...recentOffers.map(o => ({
        id: `offer-${o.id}`,
        action: `Oferta ${o.status} de $${Number(o.amountCOP).toLocaleString("es-CO")} en "${o.product?.title}"`,
        createdAt: o.createdAt,
        user: { name: o.user?.name, email: o.user?.email },
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 50);

    return NextResponse.json({ logs });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
