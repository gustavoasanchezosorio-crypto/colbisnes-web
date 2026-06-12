import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

const VERIFF_API_KEY = process.env.VERIFF_API_KEY!;
const VERIFF_SHARED_SECRET = process.env.VERIFF_SHARED_SECRET!;
const VERIFF_API_URL = process.env.VERIFF_API_URL || "https://stationapi.veriff.com";

function generateSignature(payload: string): string {
  return crypto
    .createHmac("sha256", VERIFF_SHARED_SECRET)
    .update(payload)
    .digest("hex");
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, name: true, email: true, kycStatus: true },
    });

    if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    if (user.kycStatus === "approved") {
      // Email solicitud biometrica
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.RESEND_API_KEY}` },
      body: JSON.stringify({
        from: "Colbisnes <hola@colbisnes.com>",
        to: session.user.email,
        subject: "Completa tu registro biometrico en Colbisnes",
        html: `<div style="font-family:sans-serif;max-width:520px;margin:auto;padding:36px;background:#F0F4FF;border-radius:24px"><h1 style="color:#1F6BFF;text-align:center">COLBISNES</h1><h2 style="color:#0F172A">En Colbisnes somos muy mamones con la seguridad!</h2><p style="color:#64748B;font-size:15px">Por eso tu y todos nuestros usuarios deben hacer un registro biometrico con documento de identidad. Con toda!!!</p><div style="text-align:center;margin:28px 0"><a href="https://colbisnes-web.vercel.app/kyc" style="background:linear-gradient(135deg,#1448A3,#1F6BFF);color:white;padding:16px 36px;border-radius:24px;text-decoration:none;font-weight:700;font-size:16px">Completar verificacion</a></div><p style="color:#94A3B8;font-size:12px;text-align:center">2026 Colbisnes</p></div>`,
      }),
    });
    return NextResponse.json({ success: true, status: "approved" });
    }

    // Crear sesión en Veriff
    const payload = {
      verification: {
        callback: `${process.env.NEXTAUTH_URL}/api/kyc/webhook`,
        person: {
          firstName: user.name?.split(" ")[0] || "",
          lastName: user.name?.split(" ").slice(1).join(" ") || "",
          idNumber: user.id,
        },
        document: {
          type: "ID_CARD",
          country: "CO",
        },
        vendorData: user.id,
        timestamp: new Date().toISOString(),
      },
    };

    const payloadStr = JSON.stringify(payload);
    const signature = generateSignature(payloadStr);

    const veriffRes = await fetch(`${VERIFF_API_URL}/v1/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-AUTH-CLIENT": VERIFF_API_KEY,
        "X-HMAC-SIGNATURE": signature,
      },
      body: payloadStr,
    });

    const veriffData = await veriffRes.json();

    if (!veriffRes.ok) {
      console.error("Veriff error:", veriffData);
      throw new Error(veriffData.message || "Error al crear sesión de verificación");
    }

    // Guardar ID de sesión Veriff
    await prisma.user.update({
      where: { id: user.id },
      data: {
        kycStatus: "pending",
        kycDocumentId: veriffData.verification?.id || veriffData.verification?.sessionToken,
        kycRequestedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      verificationUrl: veriffData.verification?.url,
      sessionToken: veriffData.verification?.sessionToken,
    });
  } catch (error: any) {
    console.error("Error en KYC start:", error);
    return NextResponse.json({ error: error.message || "Error interno" }, { status: 500 });
  }
}
