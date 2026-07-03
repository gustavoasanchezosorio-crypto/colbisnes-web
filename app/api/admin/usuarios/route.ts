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
    const usuarios = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true, name: true, email: true, city: true,
        role: true, kycStatus: true, createdAt: true,
        _count: { select: { products: true } },
      },
    });
    return NextResponse.json({ usuarios });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
