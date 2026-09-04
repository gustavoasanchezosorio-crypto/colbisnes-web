import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { bloqueoResponse } from "@/lib/accountBlock";
import { liberarProductosExpirados } from "@/lib/liberarExpirados";
import { requireEmailVerified } from "@/lib/requireEmailVerified";
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

const VALID_STATUSES = ["AVAILABLE", "PAYMENT_PENDING", "IN_ESCROW", "SOLD"] as const;
const VALID_CONDITIONS = ["NUEVO", "USADO", "REACONDICIONADO"] as const;

export async function GET(request: Request) {
  try {
    await liberarProductosExpirados();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "10", 10) || 10));
    const skip = (page - 1) * limit;
    const query = (searchParams.get("q") || searchParams.get("searchQuery") || "").slice(0, 200);
    const city = (searchParams.get("city") || "").slice(0, 100);
    const minPrice = searchParams.get("minPrice");
    const maxPrice = searchParams.get("maxPrice");
    const statusParam = searchParams.get("status") || "";
    const condition = (searchParams.get("condition") || "").slice(0, 50);
    const category = (searchParams.get("category") || "").slice(0, 100);

    const where: any = {};
    if (query) {
      where.OR = [
        { title: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
      ];
    }
    if (city) where.city = city;
    if (condition && (VALID_CONDITIONS as readonly string[]).includes(condition)) {
      where.condition = condition;
    }
    if (category) where.category = category;
    if (minPrice || maxPrice) {
      where.priceCOP = {};
      if (minPrice) where.priceCOP.gte = Math.max(0, parseInt(minPrice) || 0);
      if (maxPrice) where.priceCOP.lte = Math.min(1_000_000_000, parseInt(maxPrice) || 1_000_000_000);
    }
    if (statusParam && (VALID_STATUSES as readonly string[]).includes(statusParam)) {
      where.status = statusParam;
    } else {
      // Un producto ELIMINADO (soft-delete del perfil MASTER, ver DELETE en
      // app/api/products/[id]/route.ts) nunca debe aparecer en el catálogo público, ni
      // siquiera pidiéndolo explícito por query string: "ELIMINADO" a propósito NO está en
      // VALID_STATUSES, así que ?status=ELIMINADO cae aquí igual que no mandar status.
      where.status = { not: "ELIMINADO" };
    }

    const products = await prisma.product.findMany({
      where,
      // Productos destacados (featuredUntil en el futuro) aparecen primero
      orderBy: [{ featuredUntil: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      skip,
      take: limit,
      include: {
        seller: {
          select: {
            id: true,
            name: true,
            city: true,
          },
        },
        images: { select: { url: true } },
        _count: { select: { offers: { where: { status: "PENDING" } } } },
        offers: {
          where: { status: "ACCEPTED" },
          select: { id: true, userId: true },
          take: 1,
        },
      },
    });

    // Batch-compute seller ratings with a single groupBy query instead of N+1
    const sellerIds = [...new Set(products.map((p) => p.seller.id))];
    const ratingsRaw = await prisma.review.groupBy({
      by: ["toUserId"],
      where: { toUserId: { in: sellerIds } },
      _avg: { rating: true },
      _count: { rating: true },
    });
    const ratingMap = new Map(
      ratingsRaw.map((r) => [
        r.toUserId,
        { avgRating: Math.round((r._avg.rating || 0) * 10) / 10, totalReviews: r._count.rating },
      ])
    );

    // NINGUNO de los dos IMEI sale completo por aquí. Este listado es público y sin
    // sesión: devolverlos enteros convertiría el catálogo en un directorio de IMEIs
    // para clonar. Se reemplazan por la versión parcial (ver lib/dispositivos.ts).
    //
    // En la tarjeta del listado basta con el primero: los dos IMEI de un mismo
    // equipo comparten los 6 dígitos del TAC, que es lo único que se ve, así que el
    // segundo no añadiría nada. Completos, los dos, solo en /api/products/[id]/imei.
    const productsWithRating = products.map(({ imei, imei2, ...product }) => ({
      ...product,
      seller: {
        ...product.seller,
        ...(ratingMap.get(product.seller.id) ?? { avgRating: 0, totalReviews: 0 }),
      },
      firstImage: product.images[0]?.url || null,
      imeiParcial: enmascararImei(imei),
      tieneDosImei: !!imei2,
    }));

    return NextResponse.json(productsWithRating, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    console.error("Error en GET /api/products:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Verificar que el vendedor haya completado el KYC
    const seller = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { kycStatus: true, antiPhishingCode: true },
    });
    if (!seller || seller.kycStatus !== "approved") {
      return NextResponse.json(
        { error: "Debes verificar tu identidad antes de publicar productos. Ve a /kyc para completar tu verificación.", kycRequired: true },
        { status: 403 }
      );
    }

    const bloqueo = await bloqueoResponse(session.user.id);
    if (bloqueo) return bloqueo;

    // El correo debe estar confirmado antes de publicar.
    const faltaVerif = await requireEmailVerified(session.user.id);
    if (faltaVerif) return faltaVerif;

    // Aquí ya NO se exigen Nequi + Bre-B. Se exigen en el checkout, comprobando
    // al vendedor antes de que nadie pague (ver lib/checkoutOnline.ts y las rutas
    // de contra-entrega y USDT).
    //
    // Se movió por dos razones. La de fondo: pedirle los datos bancarios a alguien
    // que todavía no ha vendido nada es la puerta donde más gente se cae, y era la
    // quinta de cinco (cuenta → correo → KYC → anti-fraude → cobro). La técnica, y
    // más importante: el candado aquí no garantizaba nada, porque PATCH /api/user
    // acepta cadena vacía en ambos campos. Se podía publicar con los datos puestos,
    // vaciarlos y vender igual, y la orden entraba en custodia sin destino de pago.
    // Comprobarlo justo antes de la compra sí lo garantiza.

    // Debe tener configurado su código anti-phishing: así puede distinguir los correos
    // legítimos de Colbisnes de intentos de suplantación antes de operar en la plataforma.
    if (!seller.antiPhishingCode || seller.antiPhishingCode.trim().length === 0) {
      return NextResponse.json(
        {
          error: "Debes crear tu código anti fraude en tu perfil antes de publicar. Ve a colbisnes.com/perfil/editar",
          antiPhishingRequired: true,
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { title, description, priceCOP, city, condition, category, images } = body;
    const { imei, imei2, saludBateria, piezasReemplazadas } = body;
    const { tipoEntrega, precioEnvio } = body;

    if (!title || typeof title !== "string" || title.trim().length < 3 || title.length > 200) {
      return NextResponse.json({ error: "Título inválido (3-200 caracteres)" }, { status: 400 });
    }
    if (!description || typeof description !== "string" || description.trim().length < 10 || description.length > 5000) {
      return NextResponse.json({ error: "Descripción inválida (10-5000 caracteres)" }, { status: 400 });
    }

    // La categoría se resuelve ANTES que el precio porque el piso depende de ella.
    const finalCategory =
      typeof category === "string" && category.length <= 100 && category.trim() !== ""
        ? category
        : "Otros";

    // Piso de precio por categoría, no plano. Antes era 1.000 COP para todo, así que
    // un carro a $1.000 pasaba sin problema: justo el precio de gancho que se busca
    // evitar. Ver el porqué completo en lib/dispositivos.ts.
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
    // Obligatorio y sin valor por defecto: el `@default("ENVIO")` del schema es
    // justo lo que hizo que un carro de $46 millones apareciera ofreciendo
    // despacho a domicilio. Si el formulario no lo manda, esto rebota.
    const entrega = normalizarEntrega(tipoEntrega, precioEnvio);
    if (!entrega.ok) {
      return NextResponse.json({ error: entrega.error }, { status: 400 });
    }

    // ── Datos declarados del dispositivo (solo categoría Tecnologia) ────────────
    // Fuera de esa categoría se descartan en silencio en vez de dar error: no es
    // culpa de nadie que el formulario mande campos de más, y guardar un IMEI en
    // una publicación de un sofá no tendría sentido.
    let imeiFinal: string | null = null;
    let imei2Final: string | null = null;
    let bateriaFinal: number | null = null;
    let piezasFinal: string | null = null;

    if (categoriaPideDatosDeDispositivo(finalCategory)) {
      const imeis = validarImeisDeclarados(imei, imei2);
      if (!imeis.ok) return NextResponse.json({ error: imeis.error }, { status: 400 });
      imeiFinal = imeis.imei;
      imei2Final = imeis.imei2;

      // Un mismo aparato no puede estar publicado dos veces a la vez. Además de
      // duplicados honestos, esto marca el caso en que alguien copia el IMEI de
      // otro anuncio para aparentar un equipo legítimo.
      //
      // La búsqueda es CRUZADA: cada número declarado se busca en las dos columnas
      // de las demás publicaciones. Si solo se comparara imei con imei, bastaba con
      // publicar el mismo equipo intercambiando las dos casillas para esquivarlo.
      const declarados = [imeiFinal, imei2Final].filter((n): n is string => !!n);
      if (declarados.length > 0) {
        const yaPublicado = await prisma.product.findFirst({
          where: {
            status: { in: ["AVAILABLE", "PAYMENT_PENDING", "IN_ESCROW"] },
            OR: [{ imei: { in: declarados } }, { imei2: { in: declarados } }],
          },
          select: { id: true },
        });
        if (yaPublicado) {
          return NextResponse.json(
            { error: "Ya hay una publicación activa con ese IMEI. Si es tuya, edítala en vez de crear otra." },
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
    );

    const finalCondition = (VALID_CONDITIONS as readonly string[]).includes(condition)
      ? condition
      : "USADO";

    const product = await prisma.product.create({
      data: {
        title: title.trim(),
        description: description.trim(),
        priceCOP,
        city: city.trim(),
        condition: finalCondition,
        category: finalCategory,
        status: "AVAILABLE",
        sellerId: session.user.id,
        tipoEntrega: entrega.tipoEntrega,
        precioEnvio: entrega.precioEnvio,
        imei: imeiFinal,
        imei2: imei2Final,
        saludBateria: bateriaFinal,
        piezasReemplazadas: piezasFinal,
        images: validImageUrls?.length
          ? { create: validImageUrls.map((url) => ({ url })) }
          : undefined,
      },
      include: { images: true },
    });

    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    console.error("Error en POST /api/products:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
