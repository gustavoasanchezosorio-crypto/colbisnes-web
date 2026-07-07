import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { v2 as cloudinary } from "cloudinary";
import { validarNumeroGuia } from "@/lib/shippingValidation";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const formData = await req.formData();
    const orderId        = formData.get("orderId") as string;
    const numeroGuia      = formData.get("numeroGuia") as string;
    const transportadora  = formData.get("transportadora") as string;
    const comprobante     = formData.get("comprobante") as File | null;

    if (!orderId || !numeroGuia) {
      return NextResponse.json({ error: "Faltan datos requeridos" }, { status: 400 });
    }
    if (!comprobante) {
      return NextResponse.json({ error: "Debes adjuntar una foto de la guía o el comprobante de envío" }, { status: 400 });
    }

    const validacion = validarNumeroGuia(transportadora || "Otra", numeroGuia);
    if (!validacion.valido) {
      return NextResponse.json({ error: validacion.motivo || "Número de guía inválido" }, { status: 400 });
    }

    const orden = await prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!orden) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });

    const producto = await prisma.product.findUnique({ where: { id: orden.productId } });
    if (!producto) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

    // VALIDACION: solo el vendedor puede marcar como enviado
    if (producto.sellerId !== session.user.id) {
      return NextResponse.json({ error: "Solo el vendedor puede registrar el envio" }, { status: 403 });
    }

    // Idempotencia: si la orden ya fue marcada como enviada (o avanzó más allá),
    // no re-subimos la imagen ni fallamos. Esto cubre el caso en que el servidor
    // sí guardó el envío pero la respuesta no llegó al navegador y el vendedor
    // reintenta — antes eso podía re-subir una imagen o dar error confuso.
    if (["EN_CAMINO", "ENTREGADO", "COMPLETADO"].includes(orden.estado)) {
      return NextResponse.json({ ok: true, yaRegistrado: true });
    }

    // En contra entrega, el comprador debe haber pagado (y un admin confirmado) la comisión
    // de reserva antes de que el vendedor pueda despachar.
    if (orden.estado === "ESPERANDO_COMISION") {
      return NextResponse.json({ error: "El comprador aún no ha pagado la comisión de reserva. Debes esperar a que Colbisnes confirme ese pago antes de enviar." }, { status: 400 });
    }

    let comprobanteUrl: string | null = null;
    if (comprobante) {
      const bytes = await comprobante.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const result = await new Promise<any>((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          { folder: "colbisnes/envios", resource_type: "image" },
          (error, result) => { if (error) reject(error); else resolve(result); }
        ).end(buffer);
      });
      comprobanteUrl = result.secure_url;
    }

    await prisma.order.update({
      where: { id: orderId },
      data: {
        estado: "EN_CAMINO",
        numeroGuia,
        transportadora: transportadora || null,
        comprobanteUrl,
        enviadoAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Error al marcar envio:", err.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
