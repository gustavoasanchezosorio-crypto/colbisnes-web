import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/audit";
import { VERSION_GARANTIA, TEXTO_GARANTIA } from "@/lib/dispositivos";

export const dynamic = "force-dynamic";

/**
 * Deja constancia de que el comprador vio y aceptó las condiciones de devolución
 * por información falsa ANTES de pagar.
 *
 * Por qué se guarda en vez de solo mostrarse: una pantalla que solo se muestra no
 * sirve de nada cuando hay una disputa de plata de por medio. Sin registro, es la
 * palabra del comprador contra la del vendedor sobre si el aviso existía. Con
 * registro, hay fecha, IP, navegador y —lo más importante— UNA FOTO DE LO QUE EL
 * VENDEDOR DECLARABA EN ESE MOMENTO. Si el vendedor edita la publicación después,
 * la comparación entre esta foto y el estado actual resuelve la disputa sola.
 *
 * No toca ninguna de las cuatro rutas de pago: solo escribe en AuditLog. Es
 * deliberado — a cuatro días de abrir las compras, nada nuevo se mete en el camino
 * del dinero.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const producto = await prisma.product.findUnique({
      where: { id },
      select: {
        id: true,
        sellerId: true,
        title: true,
        priceCOP: true,
        condition: true,
        category: true,
        imei: true,
        imei2: true,
        saludBateria: true,
        piezasReemplazadas: true,
      },
    });
    if (!producto) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    if (producto.sellerId === session.user.id) {
      return NextResponse.json({ error: "Eres el vendedor de esta publicación" }, { status: 400 });
    }

    const aceptadoEn = new Date().toISOString();

    await registrarAuditoria({
      userId: session.user.id,
      action: "ACEPTAR_GARANTIA_DISPOSITIVO",
      entity: "Product",
      entityId: id,
      metadata: {
        versionTexto: VERSION_GARANTIA,
        texto: TEXTO_GARANTIA,
        aceptadoEn,
        vendedorId: producto.sellerId,
        // La foto de lo declarado en el momento de aceptar.
        declaradoPorElVendedor: {
          title: producto.title,
          priceCOP: producto.priceCOP,
          condition: producto.condition,
          category: producto.category,
          imei: producto.imei,
          imei2: producto.imei2,
          saludBateria: producto.saludBateria,
          piezasReemplazadas: producto.piezasReemplazadas,
        },
      },
      request: req,
    });

    return NextResponse.json({ ok: true, aceptadoEn, version: VERSION_GARANTIA });
  } catch (error) {
    console.error("POST /api/products/[id]/aceptar-garantia error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
