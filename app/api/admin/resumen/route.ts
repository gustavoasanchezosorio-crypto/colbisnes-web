import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function esAdmin(email: string) {
  return email?.toLowerCase() === process.env.ADMIN_EMAIL?.toLowerCase();
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !esAdmin(session.user.email)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    const [totalUsuarios, totalProductos, totalOfertas, totalVentas] = await Promise.all([
      prisma.user.count(),
      prisma.product.count(),
      prisma.offer.count(),
      prisma.product.count({ where: { status: "SOLD" } }),
    ]);
    return NextResponse.json({ totalUsuarios, totalProductos, totalOfertas, totalVentas });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
