import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const formData = await request.formData();
    const files = formData.getAll("images") as File[];
    if (!files.length) {
      return NextResponse.json({ error: "No se enviaron imágenes" }, { status: 400 });
    }

    if (files.length > 10) {
      return NextResponse.json({ error: "Máximo 10 imágenes" }, { status: 400 });
    }

    const EXT_IMAGEN = /\.(jpe?g|png|webp|gif|hei[cf]|bmp|tiff?)$/i;
    const uploadedUrls = [];
    for (const file of files) {
      // Algunos navegadores/SO no asignan un MIME type a las fotos HEIC/HEIF (file.type queda
      // vacío), así que si el tipo no viene reconocido igual aceptamos por extensión conocida.
      const pareceImagen = file.type.startsWith("image/") || (!file.type && EXT_IMAGEN.test(file.name));
      if (!pareceImagen) {
        return NextResponse.json({ error: "Solo se permiten imagenes" }, { status: 400 });
      }
      if (file.size > 5 * 1024 * 1024) {
        return NextResponse.json({ error: "Cada imagen no debe superar 5MB" }, { status: 400 });
      }

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          // format:"jpg" fuerza a Cloudinary a transcodificar el archivo (incluyendo HEIC/HEIF
          // de iPhone) a un JPG real del lado del servidor, sin depender de que el navegador
          // haya podido convertirlo antes de subirlo.
          { folder: "colbisnes", resource_type: "image", format: "jpg" },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        uploadStream.end(buffer);
      });
      uploadedUrls.push((result as any).secure_url);
    }

    return NextResponse.json({ success: true, urls: uploadedUrls });
  } catch (error: any) {
    console.error("Error al subir imágenes:", error);
    return NextResponse.json({ error: error.message || "Error interno" }, { status: 500 });
  }
}
