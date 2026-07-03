import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeTrustScore } from "@/lib/trustScore";
import { normalizarTelefonoCO } from "@/lib/phone";

export const dynamic = "force-dynamic";

const DIAS_BLOQUEO = 3;

function verificarCronSecret(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${cronSecret}`;
}

// Revisa órdenes de contraentrega en ESPERANDO_ENVIO cuyo plazo de 24 horas hábiles (8am-8pm)
// ya venció sin que el vendedor haya registrado el envío (numeroGuia). Penaliza al vendedor:
//  - Bloqueo de cuenta (compras y ventas) por 3 días, o hasta que pague la deuda, lo que sea más largo.
//  - Deuda pendiente = la comisión de reserva que el comprador ya pagó (el vendedor debe reponerla).
//  - Trust score reducido a la mitad del que tenía en ese momento.
//  - El documento/email/teléfono del vendedor se agrega a una lista negra para evitar evasión
//    mediante una cuenta nueva.
async function handleVerificacion() {
  const ahora = new Date();

  const vencidas = await prisma.order.findMany({
    where: {
      metodoPago: "CONTRA_ENTREGA",
      estado: "ESPERANDO_ENVIO",
      numeroGuia: null,
      envioPenalizado: false,
      fechaLimiteEnvio: { not: null, lt: ahora },
    },
  });

  if (vencidas.length === 0) return { penalizadas: 0 };

  let penalizadas = 0;
  for (const orden of vencidas) {
    const producto = await prisma.product.findUnique({
      where: { id: orden.productId },
      select: { sellerId: true, title: true },
    });
    if (!producto) continue;

    const vendedor = await prisma.user.findUnique({ where: { id: producto.sellerId } });
    if (!vendedor) continue;

    const trustActual = await computeTrustScore(vendedor.id);
    const deduccion = Math.round(trustActual.score / 2);
    const deuda = orden.comisionReservaCOP || 0;

    const bloqueoHasta = new Date(ahora.getTime() + DIAS_BLOQUEO * 24 * 3600000);
    const yaBloqueadoMasTarde = vendedor.blockedUntil && vendedor.blockedUntil.getTime() > bloqueoHasta.getTime();

    await prisma.$transaction([
      prisma.user.update({
        where: { id: vendedor.id },
        data: {
          blockedUntil: yaBloqueadoMasTarde ? vendedor.blockedUntil : bloqueoHasta,
          blockedReason: `Envío tardío en contraentrega (orden ${orden.id}, producto "${producto.title}")`,
          deudaPendienteCOP: { increment: deuda },
          penalizacionScorePts: { increment: deduccion },
        },
      }),
      prisma.order.update({
        where: { id: orden.id },
        data: { envioPenalizado: true },
      }),
      // NOTA: kycDocumentId hoy guarda las URLs de las fotos de KYC (selfie + cédula), no un
      // número de cédula extraído en texto — el sistema no hace OCR. Por eso "documento" queda
      // vacío por ahora; el bloqueo real de reincidencia se hace por email y teléfono.
      prisma.blacklist.create({
        data: {
          documento: null,
          email: vendedor.email,
          // Normalizado a formato E.164 (+57...) para que la comparación en el registro/perfil
          // detecte el mismo número aunque el usuario lo escriba con otro formato.
          telefono: (vendedor.phone || vendedor.phoneWhatsapp)
            ? normalizarTelefonoCO((vendedor.phone || vendedor.phoneWhatsapp) as string)
            : null,
          motivo: `Envío tardío en contraentrega — orden ${orden.id}`,
          deudaPendienteCOP: deuda,
        },
      }),
    ]);

    penalizadas++;
  }

  return { penalizadas };
}

export async function POST(req: NextRequest) {
  if (!verificarCronSecret(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const result = await handleVerificacion();
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (e) {
    console.error("POST /api/cron/verificar-envios error:", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  if (!verificarCronSecret(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const result = await handleVerificacion();
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (e) {
    console.error("GET /api/cron/verificar-envios error:", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
