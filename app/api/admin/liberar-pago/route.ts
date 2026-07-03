import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

function esAdmin(email: string) {
  return email?.toLowerCase() === process.env.ADMIN_EMAIL?.toLowerCase();
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !esAdmin(session.user.email)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { orderId, txHash } = await req.json();
    if (!orderId) return NextResponse.json({ error: "orderId requerido" }, { status: 400 });

    const orden = await prisma.order.update({
      where: { id: orderId },
      data: {
        pagoLiberado: true,
        pagoLiberadoAt: new Date(),
        txHashPago: txHash || null,
      },
    });

    return NextResponse.json({ ok: true, orden });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
