import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { rateLimit, getIP } from "@/lib/rateLimit";
import { registrarAuditoria } from "@/lib/audit";
import {
  URL_CONSULTA_IMEI_OFICIAL,
  ESTADOS_CON_PLATA_MOVIDA,
  ESTADO_RESERVA_CONTRA_ENTREGA,
} from "@/lib/dispositivos";

export const dynamic = "force-dynamic";

/**
 * Entrega el IMEI COMPLETO de una publicación.
 *
 * Existe como endpoint aparte, y no como un campo más de GET /api/products/[id],
 * por una razón concreta: el IMEI completo es el dato con el que se clona un
 * equipo. Si viajara en la respuesta normal del producto, cualquiera podría
 * recorrer el catálogo sin sesión y llevarse todos los IMEIs de un tirón.
 *
 * Quién puede verlo:
 *   1. El vendedor, siempre — es su equipo.
 *   2. El comprador de una orden de ESTA publicación que ya lo habilite. La regla
 *      exacta, y el porqué de cada camino, están en ordenHabilitaVerImei
 *      (lib/dispositivos.ts): en pago en línea desde que el pago se confirma, en
 *      contra entrega desde que reserva. Nadie más.
 *   3. Tope por hora y queda registrado quién pidió cuál.
 *
 * Por qué dejó de bastar la cédula (decisión de producto, 2026-08-09): hasta hoy
 * el único requisito era tener la identidad verificada, así que cualquiera con
 * cédula podía recorrer el catálogo recogiendo IMEIs — justo el dato con el que
 * se clona un equipo. Peor: al vendedor se le decía en el formulario de publicar
 * que su número solo lo verían compradores, y no era cierto.
 *
 * Lo que este endpoint NO hace: decir si el equipo está reportado. Eso vive en el
 * SRTM y no tiene API pública. Por eso devuelve además el enlace de la consulta
 * oficial, para que la haga el comprador. Colbisnes no verifica ni certifica nada.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const producto = await prisma.product.findUnique({
      where: { id },
      select: { id: true, imei: true, imei2: true, sellerId: true },
    });
    if (!producto) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    if (!producto.imei) {
      return NextResponse.json({ error: "Esta publicación no tiene IMEI declarado" }, { status: 404 });
    }

    // Los dos se entregan juntos: un equipo de dos SIM tiene los dos IMEI y el
    // comprador tiene que poder consultar ambos. Un equipo puede estar reportado por
    // uno solo, así que devolver únicamente el primero dejaría media revisión hecha.
    const respuesta = {
      imei: producto.imei,
      imei2: producto.imei2,
      urlConsultaOficial: URL_CONSULTA_IMEI_OFICIAL,
    };

    // Candado 1: el dueño de la publicación.
    const sesion = await getServerSession(authOptions);
    if (sesion?.user?.id === producto.sellerId) {
      return NextResponse.json(respuesta);
    }

    if (!sesion?.user?.email) {
      return NextResponse.json({ error: "Inicia sesión para continuar" }, { status: 401 });
    }

    // Candado 2: ser el comprador de una orden de ESTE producto que ya habilite el dato
    // (ver ordenHabilitaVerImei: pago confirmado, o reserva hecha en contra entrega).
    // Se compara por correo en minúsculas porque Order guarda buyerEmail (no un id),
    // que es el mismo criterio que usan confirm-delivery y disputes.
    const ordenHabilitante = await prisma.order.findFirst({
      where: {
        productId: id,
        buyerEmail: { equals: sesion.user.email, mode: "insensitive" },
        OR: [
          { estado: { in: [...ESTADOS_CON_PLATA_MOVIDA] } },
          { metodoPago: "CONTRA_ENTREGA", estado: ESTADO_RESERVA_CONTRA_ENTREGA },
        ],
      },
      select: { id: true },
    });

    if (!ordenHabilitante) {
      return NextResponse.json(
        {
          error:
            "El IMEI completo aparece cuando reserves el equipo (contra entrega) o cuando se confirme tu pago (pago en línea).",
          compraRequerida: true,
        },
        { status: 403 }
      );
    }

    // Candado 3: tope por hora y constancia de quién consultó.
    const ip = getIP(req);
    const rl = rateLimit(`imei:${sesion.user.id}:${ip}`, { limit: 20, windowSeconds: 3600 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Has consultado demasiados IMEI en poco tiempo. Intenta de nuevo más tarde." },
        { status: 429 }
      );
    }

    await registrarAuditoria({
      userId: sesion.user.id,
      action: "VER_IMEI_COMPLETO",
      entity: "Product",
      entityId: id,
      request: req,
    });

    return NextResponse.json(respuesta);
  } catch (error) {
    console.error("GET /api/products/[id]/imei error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
