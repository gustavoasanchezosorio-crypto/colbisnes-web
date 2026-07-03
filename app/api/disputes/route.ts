import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// GET: lista las disputas del usuario autenticado (recibidas o levantadas por él)
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const disputes = await prisma.dispute.findMany({
      where: {
        OR: [{ raisedByUserId: session.user.id }, { raisedAgainstUserId: session.user.id }],
      },
      orderBy: { createdAt: "desc" },
      include: {
        raisedByUser: { select: { id: true, name: true, email: true } },
        raisedAgainstUser: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({ disputes });
  } catch (error) {
    console.error("Error listando disputas:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// POST: el comprador o vendedor de una orden reporta un problema (fraude, no envío, no coincide, etc.)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session?.user?.email) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await req.json();
    const { orderId, reason, detalle, evidence } = body;

    if (!orderId || !reason) {
      return NextResponse.json({ error: "Faltan datos requeridos (orderId, reason)" }, { status: 400 });
    }

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });

    const product = await prisma.product.findUnique({ where: { id: order.productId } });
    if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

    const esComprador = order.buyerEmail?.toLowerCase() === session.user.email.toLowerCase();
    const esVendedor = product.sellerId === session.user.id;

    if (!esComprador && !esVendedor) {
      return NextResponse.json({ error: "No tienes permiso para reportar esta orden" }, { status: 403 });
    }

    let raisedAgainstUserId: string;
    if (esComprador) {
      raisedAgainstUserId = product.sellerId;
    } else {
      const buyer = await prisma.user.findUnique({ where: { email: order.buyerEmail } });
      if (!buyer) return NextResponse.json({ error: "No se encontró la cuenta del comprador" }, { status: 404 });
      raisedAgainstUserId = buyer.id;
    }

    // Evita duplicar disputas abiertas de la misma orden por el mismo usuario
    const existente = await prisma.dispute.findFirst({
      where: { orderId, raisedByUserId: session.user.id, status: { in: ["OPEN", "UNDER_REVIEW"] } },
    });
    if (existente) {
      return NextResponse.json({ error: "Ya tienes una disputa abierta para esta orden", disputeId: existente.id }, { status: 409 });
    }

    const dispute = await prisma.dispute.create({
      data: {
        orderId,
        reason,
        detalle: detalle || null,
        evidence: Array.isArray(evidence) ? evidence : [],
        raisedByUserId: session.user.id,
        raisedAgainstUserId,
        status: "OPEN",
        // El comprador pagó protección de compra extendida → revisión prioritaria
        prioritaria: order.proteccionExtendida === true,
      },
    });

    return NextResponse.json({ ok: true, dispute });
  } catch (error) {
    console.error("Error creando disputa:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
