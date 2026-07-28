import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function uploadBase64(base64: string, folder: string, publicId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(
      base64,
      {
        folder,
        public_id: publicId,
        resource_type: "image",
        overwrite: true,
        transformation: [{ quality: "auto", fetch_format: "auto" }],
      },
      (err, result) => {
        if (err || !result) return reject(err || new Error("Upload failed"));
        resolve(result.secure_url);
      }
    );
  });
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    // Sube imágenes a Cloudinary: limita para evitar abuso / consumo de cuota (5 por hora por usuario).
    const rl = rateLimit(`kyc-submit:${session.user.id}`, { limit: 5, windowSeconds: 3600 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Demasiados envíos de verificación. Espera un momento antes de volver a intentar." },
        { status: 429 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, kycStatus: true },
    });
    if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    if (user.kycStatus === "approved") {
      return NextResponse.json({ ok: true, status: "approved" });
    }

    // Rechazo temprano por tamaño: en App Router el body no tiene límite por defecto, así que
    // sin este guard un payload gigante se bufferizaría entero en memoria antes de parsearlo.
    // 25MB cubre 2 imágenes base64 + el overhead del JSON con holgura.
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > 25 * 1024 * 1024) {
      return NextResponse.json({ error: "El envío es demasiado grande." }, { status: 413 });
    }

    const body = await req.json();
    const { selfieBase64, cedulaBase64 } = body;

    if (!selfieBase64 || !cedulaBase64) {
      return NextResponse.json({ error: "Debes enviar la selfie y la foto de tu cédula" }, { status: 400 });
    }
    if (
      typeof selfieBase64 !== "string" ||
      typeof cedulaBase64 !== "string" ||
      !selfieBase64.startsWith("data:image/") ||
      !cedulaBase64.startsWith("data:image/")
    ) {
      return NextResponse.json({ error: "Formato de imagen inválido" }, { status: 400 });
    }
    // Tope por imagen: una imagen en base64 pesa ~33% más que el binario. Cortamos cada una en
    // ~10MB de texto base64 (~7MB de imagen real) para no saturar memoria ni la subida a
    // Cloudinary. (/api/upload usa 5MB sobre el binario; acá el equivalente con holgura.)
    const MAX_BASE64_LEN = 10 * 1024 * 1024; // ~10MB de caracteres base64
    if (selfieBase64.length > MAX_BASE64_LEN || cedulaBase64.length > MAX_BASE64_LEN) {
      return NextResponse.json(
        { error: "Cada imagen debe pesar menos de ~7MB. Toma la foto con menor resolución e inténtalo de nuevo." },
        { status: 413 }
      );
    }

    const ts = Date.now();
    const [selfieUrl, cedulaUrl] = await Promise.all([
      uploadBase64(selfieBase64, "colbisnes/kyc/selfies", `${user.id}_selfie_${ts}`),
      uploadBase64(cedulaBase64, "colbisnes/kyc/cedulas", `${user.id}_cedula_${ts}`),
    ]);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        kycStatus: "pending",
        kycRequestedAt: new Date(),
        kycDocumentId: JSON.stringify({ selfieUrl, cedulaUrl }),
      },
    });

    // Notificar al admin por WhatsApp (si está configurado)
    const adminWa = process.env.ADMIN_WHATSAPP;
    if (adminWa) {
      const msg = encodeURIComponent(
        `✅ *Nueva verificación facial pendiente* en Colbisnes\n\nUsuario: ${session.user.name || session.user.email}\nID: ${user.id}\n\nRevisar en: https://colbisnes.com/admin/kyc`
      );
      // Solo log — envío de WA requiere integración externa
      console.log(`Admin WA alert: https://wa.me/${adminWa}?text=${msg}`);
    }

    return NextResponse.json({ ok: true, status: "pending" });
  } catch (err: any) {
    console.error("Error en KYC submit:", err.message);
    return NextResponse.json({ error: err.message || "Error interno" }, { status: 500 });
  }
}
