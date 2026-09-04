import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { liberarProductosExpirados } from "@/lib/liberarExpirados";
import { registrarAuditoria } from "@/lib/audit";
import { esCuentaMaster } from "@/lib/adminAuth";
import { normalizarEntrega } from "@/lib/entrega";
import {
  categoriaPideDatosDeDispositivo,
  validarImeisDeclarados,
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

    // Un producto ELIMINADO (soft-delete, ver DELETE más abajo) no debe ser visible para
    // nadie que no sea la cuenta master — para todo el mundo más se comporta exactamente
    // como si no existiera, aunque el registro siga completo en la base.
    if (product.status === "ELIMINADO" && !esCuentaMaster(session)) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

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

    // NINGÚN IMEI completo viaja en esta respuesta, ni siquiera para el vendedor: la
    // página del producto no los necesita para pintarse. Quien tenga derecho a verlos
    // los pide aparte, a GET /api/products/[id]/imei, que exige identidad verificada
    // y deja constancia de quién los consultó. Así, si alguien intenta recolectar
    // IMEIs del catálogo para clonarlos, queda un rastro con nombre propio.
    const { imei, imei2, ...productoSinImei } = product;

    return NextResponse.json({
      ...productoSinImei,
      offers,
      imeiParcial: enmascararImei(imei),
      imei2Parcial: enmascararImei(imei2),
      tieneImei: !!imei,
      tieneImei2: !!imei2,
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

    const esMaster = esCuentaMaster(session);
    if (product.sellerId !== session.user.id && !esMaster) {
      return NextResponse.json({ error: "No puedes editar una publicación que no es tuya" }, { status: 403 });
    }
    // El perfil MASTER puede editar cualquier publicación de cualquiera, en cualquier
    // estado —incluso con una venta en curso— control total explícito (ver
    // lib/adminAuth.ts). Para el dueño normal la regla de siempre no cambia: el precio y
    // la descripción quedan congelados apenas hay una compra pactada, porque tocarlos
    // después afectaría algo que la otra parte ya aceptó.
    if (product.status !== "AVAILABLE" && !esMaster) {
      return NextResponse.json(
        { error: "Solo puedes editar la publicación mientras esté disponible. Ya tiene una venta en curso." },
        { status: 409 }
      );
    }

    const body = await req.json();
    const { title, description, priceCOP, city, condition, category, images } = body;
    const { imei, imei2, saludBateria, piezasReemplazadas } = body;
    const { tipoEntrega, precioEnvio } = body;

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

    // ── Cómo se entrega y cuánto vale mandarlo ─────────────────────────────────
    // Se valida con las MISMAS reglas que al crear, por lo mismo que el piso de
    // precio: una regla que solo se comprueba al publicar se esquiva editando un
    // minuto después.
    //
    // Si el cuerpo no trae `tipoEntrega` se conserva el que ya tenía. Esto es un
    // PATCH: no mandar un campo significa "no lo toques", no "bórralo". Además así
    // las publicaciones anteriores a este cambio (todas quedaron en ENVIO sin costo,
    // que es un estado válido: "envío, a coordinar por el chat") se pueden seguir
    // editando sin obligar a tocar algo que el vendedor no vino a cambiar.
    const entrega = normalizarEntrega(
      tipoEntrega === undefined ? product.tipoEntrega : tipoEntrega,
      tipoEntrega === undefined ? product.precioEnvio : precioEnvio
    );
    if (!entrega.ok) {
      return NextResponse.json({ error: entrega.error }, { status: 400 });
    }

    // ── Datos declarados del dispositivo ───────────────────────────────────────
    // Si la publicación deja de ser de Tecnologia, los tres campos se borran: un
    // IMEI colgando de un producto que ya no es un teléfono solo puede confundir.
    let imeiFinal: string | null = null;
    let imei2Final: string | null = null;
    let bateriaFinal: number | null = null;
    let piezasFinal: string | null = null;
    // No bloquea nada. Queda en la auditoría porque en una disputa importa saber que al
    // vendedor se le avisó que el número no cuadraba con su dígito de control y aun así
    // publicó: es la diferencia entre un dedazo y un número inventado.
    let sinDigitoDeControl = false;

    if (categoriaPideDatosDeDispositivo(finalCategory)) {
      // El formulario de editar puede devolver un IMEI ya enmascarado (con puntos),
      // porque es lo único que recibió del servidor. En ese caso NO es una edición:
      // significa "déjalo como estaba", y se sustituye por el valor guardado antes
      // de validar. Se resuelve casilla por casilla porque el vendedor puede muy
      // bien cambiar solo uno de los dos y dejar el otro intacto.
      const sinEnmascarar = (valor: unknown, guardado: string | null) =>
        typeof valor === "string" && valor.includes("•") ? guardado : valor;

      const imeis = validarImeisDeclarados(
        sinEnmascarar(imei, product.imei),
        sinEnmascarar(imei2, product.imei2)
      );
      if (!imeis.ok) return NextResponse.json({ error: imeis.error }, { status: 400 });
      imeiFinal = imeis.imei;
      imei2Final = imeis.imei2;
      sinDigitoDeControl = imeis.algunoSinDigitoDeControl;

      // Búsqueda cruzada en las dos columnas, igual que al crear, excluyendo esta
      // misma publicación. Se hace siempre que haya algún IMEI declarado y no solo
      // cuando cambian: es una consulta por índice, y condicionarla es la clase de
      // atajo por el que después se cuela un duplicado.
      const declarados = [imeiFinal, imei2Final].filter((n): n is string => !!n);
      if (declarados.length > 0) {
        const yaPublicado = await prisma.product.findFirst({
          where: {
            id: { not: id },
            status: { in: ["AVAILABLE", "PAYMENT_PENDING", "IN_ESCROW"] },
            OR: [{ imei: { in: declarados } }, { imei2: { in: declarados } }],
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
          tipoEntrega: entrega.tipoEntrega,
          precioEnvio: entrega.precioEnvio,
          imei: imeiFinal,
          imei2: imei2Final,
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
        // true cuando quien edita es la cuenta master y el producto es de otro vendedor —
        // distingue una edición normal del dueño de una intervención de control total.
        edicionMaster: esMaster && product.sellerId !== session.user.id,
        vendedorId: product.sellerId,
        antes: {
          title: product.title, priceCOP: product.priceCOP, city: product.city,
          condition: product.condition, category: product.category,
          imei: product.imei, imei2: product.imei2, saludBateria: product.saludBateria,
          piezasReemplazadas: product.piezasReemplazadas,
        },
        despues: {
          title: title.trim(), priceCOP, city: city.trim(),
          condition: finalCondition, category: finalCategory,
          imei: imeiFinal, imei2: imei2Final, saludBateria: bateriaFinal,
          piezasReemplazadas: piezasFinal,
          sinDigitoDeControl,
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

// Elimina una publicación. Solo el perfil MASTER (ver lib/adminAuth.ts) — no existe borrado
// para dueños normales, que solo pueden dejar de publicar retirando la oferta/contactando
// soporte. Esto NO es un delete real de Prisma: el producto tiene ofertas, mensajes, reseñas,
// órdenes y destacados que lo referencian por id, y un delete real las rompería (o las
// arrastraría en cascada, según la FK) — ninguna de las dos cosas es aceptable para historial
// de ventas o una disputa abierta. "Eliminar" acá pone status:"ELIMINADO": desaparece del
// catálogo público (ver GET de arriba y el listado en app/api/products/route.ts) pero el
// registro y todo su historial quedan intactos en la base, y es reversible con
// /api/admin/corregir-producto si hiciera falta deshacerlo.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!esCuentaMaster(session)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    if (product.status === "ELIMINADO") {
      return NextResponse.json({ ok: true, yaEliminado: true, producto: product });
    }

    const actualizado = await prisma.product.update({
      where: { id },
      data: { status: "ELIMINADO" },
    });

    await registrarAuditoria({
      userId: session!.user!.id,
      action: "ELIMINAR_PRODUCTO_MASTER",
      entity: "Product",
      entityId: id,
      metadata: { statusAnterior: product.status, vendedorId: product.sellerId, title: product.title },
      request: req,
    });

    return NextResponse.json({ ok: true, producto: actualizado });
  } catch (error: any) {
    console.error("DELETE /api/products/[id] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
