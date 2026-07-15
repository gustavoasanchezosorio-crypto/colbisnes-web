import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// El comprador sube el comprobante de la transferencia Nequi con la que pagó la comisión
// de reserva de Colbisnes en una compra contra entrega. Queda pendiente de confirmación
// manual por un admin (ver /api/admin/confirmar-comision-nequi) antes de habilitar el envío.
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const formData = await req.formData();
    const orderId = formData.get("orderId") as string;
    const referencia = (formData.get("referencia") as string) || "";
    const comprobante = formData.get("comprobante") as File | null;

    if (!orderId) return NextResponse.json({ error: "orderId requerido" }, { status: 400 });
    if (!comprobante) return NextResponse.json({ error: "Debes adjuntar el comprobante de la transferencia Nequi" }, { status: 400 });
    if (referencia.trim().length < 3) return NextResponse.json({ error: "Ingresa el número de referencia de la transferencia" }, { status: 400 });

    // El comprobante debe ser una imagen y no exceder 5MB (mismo criterio que /api/upload).
    const EXT_IMAGEN = /\.(jpe?g|png|webp|gif|hei[cf]|bmp|tiff?)$/i;
    const pareceImagen = comprobante.type.startsWith("image/") || (!comprobante.type && EXT_IMAGEN.test(comprobante.name));
    if (!pareceImagen) return NextResponse.json({ error: "El comprobante debe ser una imagen" }, { status: 400 });
    if (comprobante.size > 5 * 1024 * 1024) return NextResponse.json({ error: "La imagen no debe superar 5MB" }, { status: 400 });

    const orden = await prisma.order.findUnique({ where: { id: orderId } });
    if (!orden) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });

    if (orden.buyerEmail.toLowerCase() !== session.user.email.toLowerCase()) {
      return NextResponse.json({ error: "Solo el comprador puede confirmar este pago" }, { status: 403 });
    }
    if (orden.estado !== "ESPERANDO_COMISION") {
      return NextResponse.json({ error: "Esta orden no está esperando el pago de la comisión" }, { status: 400 });
    }

    const bytes = await comprobante.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const result = await new Promise<any>((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: "colbisnes/comision-nequi", resource_type: "image" },
        (error, result) => { if (error) reject(error); else resolve(result); }
      ).end(buffer);
    });

    await prisma.order.update({
      where: { id: orderId },
      data: {
        comisionReservaComprobanteUrl: result.secure_url,
        comisionReservaReferencia: referencia.trim(),
      },
    });

    return NextResponse.json({ ok: true, mensaje: "Comprobante recibido, un administrador confirmará el pago en breve." });
  } catch (err: any) {
    console.error("POST /api/checkout/confirmar-comision-nequi error:", err.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
