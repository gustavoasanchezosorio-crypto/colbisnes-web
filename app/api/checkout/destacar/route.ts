import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import crypto from "crypto";
import { DESTACADO_PRECIO, DESTACADO_DIAS } from "@/lib/pricing";
import { esCuentaMaster } from "@/lib/adminAuth";
import { registrarAuditoria } from "@/lib/audit";
import { enModoPrueba, bloqueadoPorModoPruebaHtml, MENSAJE_PAGO_BLOQUEADO } from "@/lib/modoPrueba";

// GET /api/checkout/destacar?productoId=X — el vendedor paga para destacar su producto
export async function GET(req: NextRequest) {
  try {
    // MODO PRUEBA (prelanzamiento): cobro real por Wompi. Ver /api/checkout/wompi.
    if (enModoPrueba(req)) return bloqueadoPorModoPruebaHtml(MENSAJE_PAGO_BLOQUEADO);

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.redirect(new URL("/auth/login?next=" + encodeURIComponent(req.url), req.url));
    }

    const productoId = req.nextUrl.searchParams.get("productoId");
    if (!productoId) return NextResponse.json({ error: "productoId requerido" }, { status: 400 });

    const producto = await prisma.product.findUnique({ where: { id: productoId } });
    if (!producto) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

    // Perfil MASTER (ver lib/adminAuth.ts): puede destacar cualquier producto, no solo los
    // propios — control total incluye impulsar cualquier publicación de la web, no solo
    // eximirse de pagar por las suyas.
    const esMaster = esCuentaMaster(session);
    if (producto.sellerId !== session.user.id && !esMaster) {
      return NextResponse.json({ error: "Solo el dueño del producto puede destacarlo" }, { status: 403 });
    }

    // Perfil MASTER: activa el destacado de inmediato, sin pasar por Wompi ni cobrar nada.
    // Mismo resultado final que deja procesarWebhookDestacado() en
    // app/api/webhooks/wompi/route.ts cuando Wompi aprueba el pago (FeaturedListing en
    // PAGADO + Product.featuredUntil), solo que sin el pago — precio:0 registra fielmente
    // que no se cobró nada, en vez de simular un cobro que no ocurrió.
    if (esMaster) {
      const ahora = new Date();
      const expiraAt = new Date(ahora.getTime() + DESTACADO_DIAS * 24 * 60 * 60 * 1000);
      const featuredGratis = await prisma.featuredListing.create({
        data: {
          productId: producto.id,
          userId: session.user.id,
          precio: 0,
          dias: DESTACADO_DIAS,
          estado: "PAGADO",
          activadoAt: ahora,
          expiraAt,
        },
      });
      await prisma.product.update({ where: { id: productoId }, data: { featuredUntil: expiraAt } });

      await registrarAuditoria({
        userId: session.user.id,
        action: "EXENCION_MASTER_DESTACAR",
        entity: "Product",
        entityId: producto.id,
        metadata: { featuredListingId: featuredGratis.id, dias: DESTACADO_DIAS, vendedorOriginalId: producto.sellerId },
        request: req,
      });

      const baseUrl = process.env.NEXT_PUBLIC_URL || "https://colbisnes.com";
      return NextResponse.redirect(baseUrl + "/product/" + productoId + "?destacado=ok");
    }

    // Idempotencia: reutilizar una solicitud pendiente reciente si existe
    const pendienteExistente = await prisma.featuredListing.findFirst({
      where: { productId: productoId, userId: session.user.id, estado: "PENDIENTE" },
      orderBy: { createdAt: "desc" },
    });

    const featured = pendienteExistente ?? await prisma.featuredListing.create({
      data: {
        productId: producto.id,
        userId: session.user.id,
        precio: DESTACADO_PRECIO,
        dias: DESTACADO_DIAS,
        estado: "PENDIENTE",
      },
    });

    // Reutilizar la MISMA referencia si el registro PENDIENTE ya tenía una. Antes esta
    // línea generaba una referencia nueva (con Date.now()) en CADA GET y la
    // sobreescribía en la fila reutilizada — incluyendo la primera vez que se reutilizaba
    // una solicitud pendiente vía `pendienteExistente` de arriba. Si el vendedor ya había
    // sido redirigido a una página de pago de Wompi con la referencia vieja (p. ej. volvió
    // atrás, reintentó por una red móvil lenta, o dio doble clic en "Destacar"), esa página
    // de Wompi seguía viva con la referencia vieja horneada en la firma. Al pagar ahí, el
    // webhook busca `featuredListing.findUnique({ where: { wompiReference: referenciaVieja } })`
    // (app/api/webhooks/wompi/route.ts) y ya no la encuentra — porque esta ruta la había
    // reemplazado por una nueva — así que un pago real y aprobado en Wompi nunca se
    // reflejaba en Colbisnes (el producto no quedaba destacado pese al cobro) (auditoría
    // 2026-07-06). Ahora solo se genera y persiste una referencia nueva la primera vez
    // (cuando `wompiReference` todavía es null); toda solicitud posterior a la misma
    // solicitud PENDIENTE reutiliza exactamente la misma referencia ya guardada.
    const referencia: string = featured.wompiReference ?? ("destacado" + featured.id.replace(/[^a-zA-Z0-9]/g, "") + Date.now());
    const montoEnCentavos: string = String(DESTACADO_PRECIO * 100);
    const moneda: string = "COP";
    // .trim() obligatorio: si la variable de entorno trae un espacio o salto de línea invisible
    // al final (fácil al pegarla en Railway), la firma SHA256 se calcula sobre el secreto+espacio
    // y Wompi la rechaza con "La firma es inválida". Mismo fix que ya tienen /checkout/wompi y
    // /checkout/wompi-comision; a este route se le había olvidado.
    const secretoIntegridad: string = (process.env.WOMPI_INTEGRITY_SECRET || "").trim();
    const publicKey: string = (process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY || "").trim();

    if (!secretoIntegridad) throw new Error("WOMPI_INTEGRITY_SECRET no está configurado");
    if (!publicKey) throw new Error("NEXT_PUBLIC_WOMPI_PUBLIC_KEY no está configurado");

    if (!featured.wompiReference) {
      await prisma.featuredListing.update({ where: { id: featured.id }, data: { wompiReference: referencia } });
    }

    const cadenaConcatenada: string = referencia + montoEnCentavos + moneda + secretoIntegridad;
    const firma: string = crypto.createHash("sha256").update(cadenaConcatenada, "utf8").digest("hex");

    const baseUrl = process.env.NEXT_PUBLIC_URL || "https://colbisnes.com";
    const redirectUrl = baseUrl + "/product/" + productoId + "?destacado=ok";

    const wompiUrl =
      "https://checkout.wompi.co/p/" +
      "?public-key=" + encodeURIComponent(publicKey) +
      "&currency=" + encodeURIComponent(moneda) +
      "&amount-in-cents=" + encodeURIComponent(montoEnCentavos) +
      "&reference=" + encodeURIComponent(referencia) +
      "&signature:integrity=" + encodeURIComponent(firma) +
      "&redirect-url=" + encodeURIComponent(redirectUrl);

    return NextResponse.redirect(wompiUrl);
  } catch (err: any) {
    console.error("Error en checkout destacar:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
