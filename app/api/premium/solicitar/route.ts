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

async function subir(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const result = await new Promise<any>((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder: "colbisnes/premium", resource_type: "image" },
      (error, result) => { if (error) reject(error); else resolve(result); }
    ).end(buffer);
  });
  return result.secure_url;
}

// POST: el vendedor solicita el badge de verificación premium (sin cobro, solo requisitos extra)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const usuarioActual = await prisma.user.findUnique({ where: { id: session.user.id }, select: { kycStatus: true, premiumStatus: true } });
    if (!usuarioActual || usuarioActual.kycStatus !== "approved") {
      return NextResponse.json({ error: "Debes completar tu verificación facial antes de solicitar el badge premium" }, { status: 403 });
    }
    if (usuarioActual.premiumStatus === "pending") {
      return NextResponse.json({ error: "Ya tienes una solicitud en revisión" }, { status: 409 });
    }
    if (usuarioActual.premiumStatus === "approved") {
      return NextResponse.json({ error: "Ya tienes el badge de verificación premium" }, { status: 409 });
    }

    const formData = await req.formData();
    const cedula      = formData.get("cedula") as File | null;
    const comprobante = formData.get("comprobante") as File | null;

    if (!cedula || !comprobante) {
      return NextResponse.json({ error: "Debes adjuntar la cédula y el comprobante de domicilio" }, { status: 400 });
    }

    const [cedulaUrl, comprobanteUrl] = await Promise.all([subir(cedula), subir(comprobante)]);

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        premiumStatus: "pending",
        premiumCedulaUrl: cedulaUrl,
        premiumComprobanteUrl: comprobanteUrl,
        premiumSolicitadoAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true, mensaje: "Solicitud enviada. La revisaremos pronto." });
  } catch (err: any) {
    console.error("POST /api/premium/solicitar error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// GET: estado actual del usuario autenticado
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    const usuario = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { premiumStatus: true, premiumSolicitadoAt: true, premiumAprobadoAt: true, premiumRechazadoAt: true },
    });
    return NextResponse.json(usuario);
  } catch (err: any) {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
