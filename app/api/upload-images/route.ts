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

    const uploadedUrls = [];
    for (const file of files) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { folder: "colbisnes" },
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
