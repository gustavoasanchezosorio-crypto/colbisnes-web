import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const userId = session.user.id;

    const mensajes = await prisma.message.findMany({
      where: {
        OR: [{ fromUserId: userId }, { toUserId: userId }]
      },
      orderBy: { createdAt: "desc" },
      include: {
        fromUser: { select: { id: true, name: true, image: true } },
        toUser: { select: { id: true, name: true, image: true } },
        product: { select: { id: true, title: true } }
      }
    });

    const mapaConvs = new Map<string, any>();

    for (const msg of mensajes) {
      const otroUsuario = msg.fromUserId === userId ? msg.toUser : msg.fromUser;
      const clave = `${otroUsuario.id}_${msg.productId || ""}`;

      if (!mapaConvs.has(clave)) {
        const noLeidos = await prisma.message.count({
          where: {
            fromUserId: otroUsuario.id,
            toUserId: userId,
            productId: msg.productId || undefined,
            read: false
          }
        });

        mapaConvs.set(clave, {
          userId: otroUsuario.id,
          userName: otroUsuario.name || "Usuario",
          userImage: otroUsuario.image,
          productId: msg.productId,
          productTitle: msg.product?.title,
          ultimoMensaje: msg.content,
          fecha: msg.createdAt,
          noLeidos
        });
      }
    }

    return NextResponse.json(Array.from(mapaConvs.values()));
  } catch (e: any) {
    console.error("GET /api/messages/conversaciones error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
