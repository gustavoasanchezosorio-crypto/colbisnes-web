import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

const DIDIT_WEBHOOK_SECRET = process.env.DIDIT_WEBHOOK_SECRET!;

// Los floats "enteros" (1.0) se normalizan a enteros (1), igual que hace Didit al firmar.
function shortenFloats(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(shortenFloats);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, shortenFloats(x)])
    );
  }
  if (typeof v === "number" && !Number.isInteger(v) && v % 1 === 0) return Math.trunc(v);
  return v;
}

// Orden lexicográfico recursivo de llaves (los arrays conservan su orden original).
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    return Object.keys(v as object)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortKeys((v as Record<string, unknown>)[k]);
        return acc;
      }, {});
  }
  return v;
}

// POST /api/kyc/webhook — recibe eventos firmados de Didit sobre el resultado de la verificación
export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    const sig = req.headers.get("x-signature-v2") || "";
    const ts = Number(req.headers.get("x-timestamp"));

    // 1. Frescura — máximo 300s de diferencia (protección contra replay)
    if (!ts || Math.abs(Date.now() / 1000 - ts) > 300) {
      return NextResponse.json({ error: "Webhook expirado" }, { status: 401 });
    }

    const parsed = JSON.parse(raw);

    // 2. Canonicalización (shortenFloats -> sortKeys -> JSON.stringify)
    const canonical = JSON.stringify(sortKeys(shortenFloats(parsed)));

    // 3. Comparación HMAC-SHA256 en tiempo constante
    const expected = crypto.createHmac("sha256", DIDIT_WEBHOOK_SECRET).update(canonical, "utf8").digest("hex");
    const sigBuf = Buffer.from(sig, "hex");
    const expBuf = Buffer.from(expected, "hex");
    const firmaValida = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);

    if (!firmaValida) {
      console.error("Didit webhook: firma inválida");
      return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
    }

    const webhookType = parsed.webhook_type;
    const status = parsed.status;
    const vendorData = parsed.vendor_data; // guardamos aquí el userId

    if (webhookType !== "status.updated") {
      return NextResponse.json({ ok: true, ignored: true });
    }
    if (!vendorData) {
      return NextResponse.json({ ok: true });
    }

    // Estados literales de Didit v3 (case-sensitive)
    let kycStatus = "pending";
    if (status === "Approved") kycStatus = "approved";
    else if (status === "Declined") kycStatus = "rejected";
    else if (status === "In Review" || status === "In Progress" || status === "Awaiting User" || status === "Resubmitted") kycStatus = "pending";
    else if (status === "Expired" || status === "Abandoned" || status === "Kyc Expired") kycStatus = "rejected";

    await prisma.user.update({
      where: { id: vendorData },
      data: {
        kycStatus,
        kycLevel: kycStatus === "approved" ? 2 : 0,
        ...(kycStatus === "approved" && { kycApprovedAt: new Date() }),
        ...(kycStatus === "rejected" && { kycRejectedAt: new Date() }),
      },
    });

    console.log(`KYC Didit actualizado para usuario ${vendorData}: ${status} -> ${kycStatus}`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error en webhook Didit:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
