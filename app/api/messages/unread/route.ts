import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ count: 0 });
    }

    const productId = req.nextUrl.searchParams.get("productId");

    const [count, latest] = await Promise.all([
      prisma.message.count({
        where: {
          toUserId: session.user.id,
          read: false,
          ...(productId ? { productId } : {}),
        },
      }),
      // Mensaje más reciente recibido, sin importar si ya fue marcado como leído.
      // Se usa para detectar mensajes nuevos de forma confiable, sin depender del
      // flag "read" (que puede cambiar por otro poller concurrente que abre el chat).
      prisma.message.findFirst({
        where: {
          toUserId: session.user.id,
          ...(productId ? { productId } : {}),
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          createdAt: true,
          productId: true,
          fromUser: { select: { name: true } },
          // Producto al que hace referencia el mensaje, para que la notificación
          // le diga al usuario de qué publicación le están escribiendo.
          product: { select: { id: true, title: true, images: { take: 1, select: { url: true } } } },
        },
      }),
    ]);

    return NextResponse.json({
      count,
      latestId: latest?.id ?? null,
      latestAt: latest?.createdAt ?? null,
      latestFrom: latest?.fromUser?.name ?? null,
      latestProductId: latest?.product?.id ?? null,
      latestProductTitle: latest?.product?.title ?? null,
      latestProductImage: latest?.product?.images?.[0]?.url ?? null,
    });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
