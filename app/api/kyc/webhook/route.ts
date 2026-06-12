import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

const VERIFF_SHARED_SECRET = process.env.VERIFF_SHARED_SECRET!;

function verifySignature(payload: string, signature: string): boolean {
  const expected = crypto
    .createHmac("sha256", VERIFF_SHARED_SECRET)
    .update(payload)
    .digest("hex");
  return expected === signature;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const signature = req.headers.get("x-hmac-signature") || "";

    if (!verifySignature(body, signature)) {
      console.error("Veriff webhook: firma inválida");
      return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
    }

    const data = JSON.parse(body);
    console.log("Veriff webhook recibido:", JSON.stringify(data, null, 2));

    const verification = data.verification || data;
    const vendorData = verification.vendorData; // userId
    const status = verification.status;
    const code = verification.code;

    if (!vendorData) {
      return NextResponse.json({ received: true });
    }

    // Mapear estados de Veriff
    // code 9001 = approved, 9102 = declined, 9103 = resubmission_requested
    let kycStatus = "pending";
    if (code === 9001 || status === "approved") {
      kycStatus = "approved";
    } else if (code === 9102 || status === "declined") {
      kycStatus = "rejected";
    } else if (code === 9103) {
      kycStatus = "resubmit";
    }

    await prisma.user.update({
      where: { id: vendorData },
      data: {
        kycStatus,
        kycLevel: kycStatus === "approved" ? 2 : 0,
        ...(kycStatus === "approved" && { kycApprovedAt: new Date() }),
        ...(kycStatus === "rejected" && { kycRejectedAt: new Date() }),
      },
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Error en webhook Veriff:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
