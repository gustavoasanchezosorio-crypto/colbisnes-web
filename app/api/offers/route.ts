import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const now = new Date();

    const expired = await prisma.product.findMany({
      where: {
        status: "PAYMENT_PENDING",
        paymentExpiresAt: {
          not: null,
          lt: now,
        },
      },
      select: { id: true },
    });

    if (expired.length === 0) {
      return NextResponse.json({ ok: true, released: 0 });
    }

    await prisma.product.updateMany({
      where: { id: { in: expired.map((p) => p.id) } },
      data: {
        status: "AVAILABLE",
        acceptedOfferId: null,
        paymentExpiresAt: null,
      },
    });

    return NextResponse.json({ ok: true, released: expired.length });
  } catch (error) {
    console.error("POST /api/cron/liberar error:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}

// Si alguien entra por el navegador, que no rompa:
export async function GET() {
  return NextResponse.json(
    { ok: false, message: "Usa POST para ejecutar la liberación" },
    { status: 405 }
  );
}