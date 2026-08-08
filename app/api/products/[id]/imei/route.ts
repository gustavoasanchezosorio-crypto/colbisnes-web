import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireKyc } from "@/lib/requireKyc";
import { rateLimit, getIP } from "@/lib/rateLimit";
import { registrarAuditoria } from "@/lib/audit";
import { URL_CONSULTA_IMEI_OFICIAL } from "@/lib/dispositivos";

export const dynamic = "force-dynamic";

/**
 * Entrega el IMEI COMPLETO de una publicación.
 *
 * Existe como endpoint aparte, y no como un campo más de GET /api/products/[id],
 * por una razón concreta: el IMEI completo es el dato con el que se clona un
 * equipo. Si viajara en la respuesta normal del producto, cualquiera podría
 * recorrer el catálogo sin sesión y llevarse todos los IMEIs de un tirón.
 *
 * Tres candados, en este orden:
 *   1. El vendedor siempre puede ver el suyo, sin más requisitos.
 *   2. Cualquier otra persona necesita identidad verificada (mismo listón que
 *      para escribirle a alguien por el chat). No impide que un delincuente con
 *      cédula real lo pida, pero lo obliga a hacerlo CON NOMBRE PROPIO.
 *   3. Tope de 20 consultas por hora y queda registrado quién pidió cuál. Un
 *      patrón de recolección masiva deja de ser invisible.
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
      select: { id: true, imei: true, sellerId: true },
    });
    if (!producto) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    if (!producto.imei) {
      return NextResponse.json({ error: "Esta publicación no tiene IMEI declarado" }, { status: 404 });
    }

    // Candado 1: el dueño de la publicación.
    const sesion = await getServerSession(authOptions);
    if (sesion?.user?.id === producto.sellerId) {
      return NextResponse.json({ imei: producto.imei, urlConsultaOficial: URL_CONSULTA_IMEI_OFICIAL });
    }

    // Candado 2: identidad verificada.
    const { session, response: errorKyc } = await requireKyc();
    if (errorKyc) return errorKyc;

    // Candado 3: tope por hora y constancia de quién consultó.
    const ip = getIP(req);
    const rl = rateLimit(`imei:${session.user.id}:${ip}`, { limit: 20, windowSeconds: 3600 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Has consultado demasiados IMEI en poco tiempo. Intenta de nuevo más tarde." },
        { status: 429 }
      );
    }

    await registrarAuditoria({
      userId: session.user.id,
      action: "VER_IMEI_COMPLETO",
      entity: "Product",
      entityId: id,
      request: req,
    });

    return NextResponse.json({ imei: producto.imei, urlConsultaOficial: URL_CONSULTA_IMEI_OFICIAL });
  } catch (error) {
    console.error("GET /api/products/[id]/imei error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
