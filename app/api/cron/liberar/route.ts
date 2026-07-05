// app/api/cron/liberar/route.ts
import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { liberarProductosExpirados } from "@/lib/liberarExpirados";

export const dynamic = "force-dynamic";

function verificarCronSecret(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false; // Sin secret configurado, bloquear
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${cronSecret}`;
}

export async function POST(req: NextRequest) {
  if (!verificarCronSecret(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const result = await liberarProductosExpirados();
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (e) {
    console.error("POST /api/cron/liberar error:", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  if (!verificarCronSecret(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const result = await liberarProductosExpirados();
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (e) {
    console.error("GET /api/cron/liberar error:", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}