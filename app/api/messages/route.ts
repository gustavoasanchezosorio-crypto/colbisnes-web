import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { rateLimit, getIP } from "@/lib/rateLimit";
import { prisma } from "@/lib/prisma";
import { requireKyc } from "@/lib/requireKyc";
import { limpiarContenidoMensaje } from "@/lib/contactFilter";

export async function POST(req: NextRequest) {
  try {
    const { session, response: kycError } = await requireKyc();
    if (kycError) return kycError;

    const ip = getIP(req);
    const rl = rateLimit(`messages:${session.user.id}:${ip}`, { limit: 30, windowSeconds: 60 });
    if (!rl.allowed) {
      return NextResponse.json({ error: "Demasiados mensajes. Espera un momento." }, { status: 429 });
    }

    const { toUserId, productId, content } = await req.json();

    if (!toUserId || typeof toUserId !== "string") {
      return NextResponse.json({ error: "Destinatario requerido" }, { status: 400 });
    }
    if (toUserId === session.user.id) {
      return NextResponse.json({ error: "No puedes enviarte mensajes a ti mismo" }, { status: 400 });
    }
    if (!content || typeof content !== "string" || !content.trim()) {
      return NextResponse.json({ error: "Mensaje vacío" }, { status: 400 });
    }
    if (content.length > 2000) {
      return NextResponse.json({ error: "Mensaje demasiado largo (máx 2000 caracteres)" }, { status: 400 });
    }

    // Verify recipient exists
    const recipient = await prisma.user.findUnique({ where: { id: toUserId }, select: { id: true } });
    if (!recipient) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

    // Ocultamos datos de contacto externo (teléfono, WhatsApp, redes, correo) para
    // reducir el riesgo de que la relación comprador-vendedor se mude fuera de Colbisnes
    const { contenido, oculto } = limpiarContenidoMensaje(content.trim());

    const message = await prisma.message.create({
      data: {
        content: contenido,
        fromUserId: session.user.id,
        toUserId,
        productId: productId || null,
      },
    });

    return NextResponse.json({ ok: true, message, contactoOculto: oculto });
  } catch (e) {
    console.error("POST /api/messages error:", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const withUserId = searchParams.get("withUserId");
    const productId = searchParams.get("productId");

    if (!withUserId || typeof withUserId !== "string") {
      return NextResponse.json({ error: "withUserId requerido" }, { status: 400 });
    }

    // IDOR fix: verify the session user has actually interacted with withUserId
    const hasConversation = await prisma.message.findFirst({
      where: {
        OR: [
          { fromUserId: session.user.id, toUserId: withUserId },
          { fromUserId: withUserId, toUserId: session.user.id },
        ],
      },
      select: { id: true },
    });

    // Also allow if they are trying to start a conversation (no prior messages yet)
    // In that case, verify withUserId is a valid user
    if (!hasConversation) {
      const targetUser = await prisma.user.findUnique({ where: { id: withUserId }, select: { id: true } });
      if (!targetUser) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const where: any = {
      OR: [
        { fromUserId: session.user.id, toUserId: withUserId },
        { fromUserId: withUserId, toUserId: session.user.id },
      ],
    };
    if (productId) where.productId = productId;

    const messages = await prisma.message.findMany({
      where,
      orderBy: { createdAt: "asc" },
      take: 200,
      include: {
        fromUser: { select: { id: true, name: true, image: true } },
        toUser: { select: { id: true, name: true, image: true } },
      },
    });

    await prisma.message.updateMany({
      where: {
        toUserId: session.user.id,
        fromUserId: withUserId,
        read: false,
        ...(productId ? { productId } : {}),
      },
      data: { read: true },
    });

    return NextResponse.json(messages);
  } catch (e) {
    console.error("GET /api/messages error:", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
