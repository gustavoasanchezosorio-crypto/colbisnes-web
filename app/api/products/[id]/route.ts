import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { liberarProductosExpirados } from "@/lib/liberarExpirados";
import { registrarAuditoria } from "@/lib/audit";
import {
  categoriaPideDatosDeDispositivo,
  normalizarImei,
  imeiTieneDigitoDeControlValido,
  normalizarSaludBateria,
  normalizarPiezas,
  enmascararImei,
  pisoDePrecio,
  mensajePisoDePrecio,
  TECHO_DE_PRECIO,
} from "@/lib/dispositivos";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const VALID_CONDITIONS = ["NUEVO", "USADO", "REACONDICIONADO"] as const;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await liberarProductosExpirados();
    const session = await getServerSession(authOptions);
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        seller: { select: { id: true, name: true, image: true, kycStatus: true } }, // email omitido intencionalmente (privacidad)
        images: true,
        offers: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!product) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    // El monto, mensaje e identidad de cada oferta son información sensible entre
    // comprador y vendedor (un competidor podía ver cuánto ofrecía cada quien, o
    // leer mensajes con datos personales) — antes CUALQUIER visitante, sin sesión
    // siquiera, recibía aquí la lista completa de ofertas de TODOS los
    // compradores con monto, mensaje y nombre (auditoría 2026-07-06). Ahora: el
    // vendedor sigue viendo todo (lo necesita para aceptar/rechazar); cada quien
    // ve el detalle completo de SU PROPIA oferta; y la oferta ya ACEPTADA (si no
    // sos ni el vendedor ni quien la hizo) solo expone el monto — sin mensaje ni
    // identidad — porque /checkout la necesita para cobrar el precio pactado, no
    // el precio de lista, cuando el vendedor aceptó una contraoferta.
    const esVendedor = session?.user?.id === product.sellerId;
    const miUserId = session?.user?.id;
    const offers = esVendedor
      ? product.offers
      : product.offers
          .filter((o) => o.userId === miUserId || o.id === product.acceptedOfferId)
          .map((o) =>
            o.userId === miUserId
              ? o
              : { id: o.id, productId: o.productId, amountCOP: o.amountCOP, status: o.status }
          );

    // El IMEI completo NO viaja en esta respuesta ni siquiera para el vendedor: la
    // página del producto no lo necesita para pintarse. Quien tenga derecho a verlo
    // lo pide aparte, a GET /api/products/[id]/imei, que exige identidad verificada
    // y deja constancia de quién lo consultó. Así, si alguien intenta recolectar
    // IMEIs del catálogo para clonarlos, queda un rastro con nombre propio.
    const { imei, ...productoSinImei } = product;

    return NextResponse.json({
      ...productoSinImei,
      offers,
      imeiParcial: enmascararImei(imei),
      tieneImei: !!imei,
    });
  } catch (error: any) {
    console.error("GET /api/products/[id] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Editar una publicación. Solo el DUEÑO y solo mientras esté DISPONIBLE: apenas hay una
// oferta aceptada / pago / custodia, el precio y la descripción quedan congelados, porque
// cambiar lo que la otra parte ya pactó o pagó sería un problema de plata. Valida igual que
// al crear (POST /api/products) y reemplaza las fotos de forma atómica.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

    if (product.sellerId !== session.user.id) {
      return NextResponse.json({ error: "No puedes editar una publicación que no es tuya" }, { status: 403 });
    }
    if (product.status !== "AVAILABLE") {
      return NextResponse.json(
        { error: "Solo puedes editar la publicación mientras esté disponible. Ya tiene una venta en curso." },
        { status: 409 }
      );
    }

    const body = await req.json();
    const { title, description, priceCOP, city, condition, category, images } = body;
    const { imei, saludBateria, piezasReemplazadas } = body;

    if (!title || typeof title !== "string" || title.trim().length < 3 || title.length > 200) {
      return NextResponse.json({ error: "Título inválido (3-200 caracteres)" }, { status: 400 });
    }
    if (!description || typeof description !== "string" || description.trim().length < 10 || description.length > 5000) {
      return NextResponse.json({ error: "Descripción inválida (10-5000 caracteres)" }, { status: 400 });
    }

    const finalCategory =
      typeof category === "string" && category.length <= 100 && category.trim() !== ""
        ? category
        : product.category;

    // El MISMO piso que en POST, y esto no es duplicación por descuido: si el piso
    // solo viviera al crear, bastaba con publicar el carro en $20.000.000 y editarlo
    // a $1 un minuto después. El agujero se cierra en los dos sitios o no se cierra.
    const piso = pisoDePrecio(finalCategory);
    if (typeof priceCOP !== "number" || !Number.isFinite(priceCOP)) {
      return NextResponse.json({ error: "Precio inválido" }, { status: 400 });
    }
    if (priceCOP < piso) {
      return NextResponse.json({ error: mensajePisoDePrecio(finalCategory, piso) }, { status: 400 });
    }
    if (priceCOP > TECHO_DE_PRECIO) {
      return NextResponse.json({ error: "Precio inválido (demasiado alto)" }, { status: 400 });
    }
    if (!city || typeof city !== "string" || city.length > 100) {
      return NextResponse.json({ error: "Ciudad inválida" }, { status: 400 });
    }

    // ── Datos declarados del dispositivo ───────────────────────────────────────
    // Si la publicación deja de ser de Tecnologia, los tres campos se borran: un
    // IMEI colgando de un producto que ya no es un teléfono solo puede confundir.
    let imeiFinal: string | null = null;
    let bateriaFinal: number | null = null;
    let piezasFinal: string | null = null;

    if (categoriaPideDatosDeDispositivo(finalCategory)) {
      // El formulario de editar puede devolver el IMEI ya enmascarado (con puntos),
      // porque es lo único que recibió del servidor. En ese caso NO es una edición:
      // significa "déjalo como estaba".
      const vieneEnmascarado = typeof imei === "string" && imei.includes("•");
      if (vieneEnmascarado) {
        imeiFinal = product.imei;
      } else if (imei !== undefined && imei !== null && String(imei).trim() !== "") {
        imeiFinal = normalizarImei(imei);
        if (!imeiFinal) {
          return NextResponse.json(
            { error: "El IMEI debe tener 15 dígitos. Márcalo en el teclado del teléfono: *#06#" },
            { status: 400 }
          );
        }
        if (!imeiTieneDigitoDeControlValido(imeiFinal)) {
          return NextResponse.json(
            { error: "Ese IMEI no es válido: no pasa el dígito de control. Revisa que lo hayas copiado completo y sin cambiar ningún número." },
            { status: 400 }
          );
        }
        if (imeiFinal !== product.imei) {
          const yaPublicado = await prisma.product.findFirst({
            where: {
              imei: imeiFinal,
              id: { not: id },
              status: { in: ["AVAILABLE", "PAYMENT_PENDING", "IN_ESCROW"] },
            },
            select: { id: true },
          });
          if (yaPublicado) {
            return NextResponse.json(
              { error: "Ya hay una publicación activa con ese IMEI." },
              { status: 409 }
            );
          }
        }
      }
      if (saludBateria !== undefined && saludBateria !== null && String(saludBateria).trim() !== "") {
        bateriaFinal = normalizarSaludBateria(saludBateria);
        if (bateriaFinal === null) {
          return NextResponse.json({ error: "La salud de la batería debe ser un número entre 1 y 100" }, { status: 400 });
        }
      }
      piezasFinal = normalizarPiezas(piezasReemplazadas);
    }
    if (images && (!Array.isArray(images) || images.length > 10)) {
      return NextResponse.json({ error: "Máximo 10 imágenes" }, { status: 400 });
    }
    const validImageUrls = (images as string[] | undefined)?.filter(
      (url) => typeof url === "string" && url.startsWith("https://res.cloudinary.com/")
    ) ?? [];

    const finalCondition = (VALID_CONDITIONS as readonly string[]).includes(condition)
      ? condition
      : product.condition;

    // Borra las fotos viejas y crea las nuevas en la MISMA transacción del update, para
    // no dejar el producto sin imágenes si algo falla a mitad de camino.
    const [, actualizado] = await prisma.$transaction([
      prisma.productImage.deleteMany({ where: { productId: id } }),
      prisma.product.update({
        where: { id },
        data: {
          title: title.trim(),
          description: description.trim(),
          priceCOP,
          city: city.trim(),
          condition: finalCondition,
          category: finalCategory,
          imei: imeiFinal,
          saludBateria: bateriaFinal,
          piezasReemplazadas: piezasFinal,
          images: validImageUrls.length
            ? { create: validImageUrls.map((url) => ({ url })) }
            : undefined,
        },
        include: { images: true },
      }),
    ]);

    await registrarAuditoria({
      userId: session.user.id,
      action: "EDITAR_PRODUCTO",
      entity: "Product",
      entityId: id,
      // Se guardan también los datos del dispositivo porque son EXACTAMENTE lo que se
      // discute en una devolución por información falsa: si el vendedor publicó
      // "batería 100 %, ninguna pieza cambiada" y lo editó a "80 %, pantalla" después
      // de que el comprador reclamara, aquí queda con fecha, IP y navegador.
      metadata: {
        antes: {
          title: product.title, priceCOP: product.priceCOP, city: product.city,
          condition: product.condition, category: product.category,
          imei: product.imei, saludBateria: product.saludBateria,
          piezasReemplazadas: product.piezasReemplazadas,
        },
        despues: {
          title: title.trim(), priceCOP, city: city.trim(),
          condition: finalCondition, category: finalCategory,
          imei: imeiFinal, saludBateria: bateriaFinal,
          piezasReemplazadas: piezasFinal,
        },
      },
      request: req,
    });

    return NextResponse.json({ ok: true, producto: actualizado });
  } catch (error: any) {
    console.error("PATCH /api/products/[id] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
