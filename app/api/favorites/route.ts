import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { sendWhatsapp } from "@/lib/whatsapp";
import { colbisnesEmailTemplate } from "@/lib/emailTemplate";

// Hitos de favoritos que disparan una notificación al vendedor. Nunca se notifica
// por cada favorito (sería spam): solo cuando el producto CRUZA uno de estos números.
// Ajustable libremente sin tocar el resto de la lógica.
const HITOS_FAVORITOS = [5, 10, 25, 50, 100, 250, 500];

// GET: saber si el usuario marcó favorito y el total, O listar favoritos del usuario
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get("productId");
    const listAll = searchParams.get("list") === "true";
    const session = await getServerSession(authOptions);

    // Listar todos los favoritos del usuario autenticado
    if (listAll) {
      if (!session?.user?.id) return NextResponse.json({ favorites: [] });
      const favProductIds = await prisma.favorite.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        select: { productId: true },
      });
      const products = await prisma.product.findMany({
        where: { id: { in: favProductIds.map(f => f.productId) } },
        select: {
          id: true, title: true, description: true,
          priceCOP: true, city: true, status: true,
          images: { select: { url: true }, take: 1 },
        },
      });
      // Preserve favorites order
      const order = new Map(favProductIds.map((f, i) => [f.productId, i]));
      products.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      return NextResponse.json({ favorites: products });
    }

    if (!productId) return NextResponse.json({ error: "Falta productId" }, { status: 400 });

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { favoritesCount: true },
    });

    let esFavorito = false;
    if (session?.user?.id) {
      const fav = await prisma.favorite.findUnique({
        where: { userId_productId: { userId: session.user.id, productId } },
      });
      esFavorito = !!fav;
    }

    return NextResponse.json({ count: product?.favoritesCount || 0, esFavorito });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST: toggle favorito
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { productId } = await req.json();
    if (!productId) return NextResponse.json({ error: "Falta productId" }, { status: 400 });

    const existe = await prisma.favorite.findUnique({
      where: { userId_productId: { userId: session.user.id, productId } }
    });

    if (existe) {
      await prisma.favorite.delete({ where: { id: existe.id } });
      const p = await prisma.product.update({
        where: { id: productId },
        data: { favoritesCount: { decrement: 1 } },
        select: { favoritesCount: true }
      });
      return NextResponse.json({ esFavorito: false, count: Math.max(0, p.favoritesCount) });
    } else {
      await prisma.favorite.create({ data: { userId: session.user.id, productId } });
      const p = await prisma.product.update({
        where: { id: productId },
        data: { favoritesCount: { increment: 1 } },
        select: {
          favoritesCount: true,
          title: true,
          seller: { select: { id: true, name: true, email: true, phoneWhatsapp: true } },
        },
      });

      // Notificar al vendedor solo cuando el producto CRUZA un hito de favoritos.
      // La deduplicación usa la tabla AuditLog existente (para no migrar el esquema en
      // producción): una vez registrado HITO_FAVORITOS_<n> para ese producto no se vuelve
      // a notificar ese hito, aunque el contador baje y vuelva a subir. Todo va dentro de
      // try/catch: un fallo de notificación jamás debe romper el toggle de favorito.
      if (HITOS_FAVORITOS.includes(p.favoritesCount) && p.seller) {
        try {
          const action = "HITO_FAVORITOS_" + p.favoritesCount;
          const yaNotificado = await prisma.auditLog.findFirst({
            where: { entity: "Product", entityId: productId, action },
            select: { id: true },
          });
          if (!yaNotificado) {
            await prisma.auditLog.create({
              data: { userId: p.seller.id, action, entity: "Product", entityId: productId },
            });
            const nombre = p.seller.name || "Vendedor";
            const baseUrl = process.env.NEXT_PUBLIC_URL || "https://colbisnes.com";
            const urlProducto = baseUrl + "/product/" + productId;
            const html = colbisnesEmailTemplate({
              preheader: "Tu producto está llamando la atención",
              titulo: "Tu producto está gustando 🔥",
              cuerpo: `Hola ${nombre}, tu producto <strong>${p.title}</strong> ya tiene <strong style="color:#1F6BFF;">${p.favoritesCount} favoritos</strong> en Colbisnes.<br/><br/>Cada favorito es un comprador interesado. Es un buen momento para revisar tu publicación y responder ofertas rápido.`,
              ctaTexto: "Ver mi producto",
              ctaUrl: urlProducto,
            });
            await sendEmail({
              to: p.seller.email,
              subject: `Tu producto ya tiene ${p.favoritesCount} favoritos en Colbisnes`,
              html,
            });
            await sendWhatsapp({
              to: p.seller.phoneWhatsapp || "",
              body: "🔥 *Colbisnes* - ¡Tu producto está gustando!\n\nHola " + nombre + ", tu producto *" + p.title + "* ya tiene " + p.favoritesCount + " favoritos.\n\nCada favorito es un comprador interesado. Ingresa a Colbisnes para revisar tu publicación.",
            });
          }
        } catch (notifError) {
          console.error("Error notificando hito de favoritos:", notifError);
        }
      }

      return NextResponse.json({ esFavorito: true, count: p.favoritesCount });
    }
  } catch (e: any) {
    console.error("POST /api/favorites error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
