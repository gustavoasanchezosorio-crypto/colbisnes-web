import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * El VENDEDOR marca su propia publicación como vendida por fuera de Colbisnes (trato
 * directo, otra red social, otro marketplace, etc.), sin que haya pasado por una oferta
 * aceptada ni un pago dentro de la plataforma. Pedido explícito del vendedor: hasta ahora
 * la única forma de que un producto llegara a "Vendido" era el flujo interno completo
 * (oferta aceptada → pago → custodia → confirmar entrega), así que algo vendido de boca
 * en boca se quedaba "Disponible" para siempre — seguía recibiendo mensajes y ofertas por
 * un producto que ya no existía.
 *
 * Solo aplica mientras el producto está AVAILABLE. Si ya hay una oferta aceptada
 * (PAYMENT_PENDING) o plata en custodia (IN_ESCROW), hay una operación DENTRO de Colbisnes
 * en curso y el vendedor no puede saltársela marcando la venta como externa — eso dejaría
 * a un comprador que ya pagó o está pagando sin producto ni respuesta. Para esos casos
 * sigue el flujo normal (confirmar entrega) o soporte si algo se traba.
 *
 * Cualquier oferta PENDING que siga abierta se rechaza en la misma transacción: el
 * artículo ya no está disponible, así que dejarla "pendiente" para siempre confundiría a
 * quien la hizo (mismo criterio que liberarProductosExpirados con las ofertas de un pago
 * que venció).
 *
 * No es reversible desde acá a propósito — como el borrado de producto, es una decisión de
 * una sola vía para un vendedor normal. Si alguien se equivoca, existe
 * /api/admin/corregir-producto para la cuenta master.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const product = await prisma.product.findUnique({
      where: { id },
      select: { id: true, sellerId: true, status: true, title: true },
    });
    if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    if (product.sellerId !== session.user.id) {
      return NextResponse.json(
        { error: "No puedes marcar como vendida una publicación que no es tuya" },
        { status: 403 }
      );
    }

    // Idempotente: si ya está SOLD (doble clic, dos pestañas), no es un error.
    if (product.status === "SOLD") {
      return NextResponse.json({ ok: true, yaVendido: true });
    }
    if (product.status !== "AVAILABLE") {
      const enCursoEnColbisnes = product.status === "PAYMENT_PENDING" || product.status === "IN_ESCROW";
      return NextResponse.json(
        {
          error: enCursoEnColbisnes
            ? "Ya hay una compra en curso dentro de Colbisnes (pago o custodia). No puedes marcarla como vendida fuera de la app mientras esa operación siga abierta."
            : "Esta publicación no está disponible para marcarla como vendida en este momento.",
        },
        { status: 409 }
      );
    }

    const [, actualizado] = await prisma.$transaction([
      prisma.offer.updateMany({
        where: { productId: id, status: "PENDING" },
        data: { status: "REJECTED" },
      }),
      prisma.product.update({
        where: { id },
        data: { status: "SOLD", soldAt: new Date() },
      }),
    ]);

    await registrarAuditoria({
      userId: session.user.id,
      action: "MARCAR_VENDIDO_FUERA_DE_APP",
      entity: "Product",
      entityId: id,
      metadata: { title: product.title },
      request: req,
    });

    // Aviso en tiempo real a quien tenga la ficha abierta (comprador con oferta pendiente,
    // etc.) — mismo canal que usa el resto de transiciones de estado. Si `global.io` no
    // está (ver comentario en app/api/offers/route.ts), se omite sin romper nada: el
    // polling de 5s de ProductPageClient igual lo refleja.
    try {
      const io = (global as any).io;
      if (io) io.to(`product-${id}`).emit("product-status-changed", { productId: id, status: "SOLD" });
    } catch {}

    return NextResponse.json({ ok: true, producto: actualizado });
  } catch (error: any) {
    console.error("POST /api/products/[id]/marcar-vendido error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
