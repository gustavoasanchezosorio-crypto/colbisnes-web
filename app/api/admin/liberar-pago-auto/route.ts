import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { verificarCodigoTOTP } from "@/lib/totp";
import { enviarUSDT, esDireccionValida } from "@/lib/hotWallet";

function esAdmin(email?: string | null) {
  return !!email && email.toLowerCase() === process.env.ADMIN_EMAIL?.toLowerCase();
}

const CAP_DIARIO_USD = parseFloat(process.env.HOT_WALLET_DAILY_CAP_USD || "500");

// POST: aprueba y ejecuta un desembolso automático en USDT-BEP20 desde la hot wallet de Colbisnes.
// Requiere: sesión de admin + código TOTP vigente + orden válida + tope diario/por-transacción no superado.
// Cualquier caso que no cumpla estas condiciones debe resolverse por el flujo manual existente
// (/api/admin/liberar-pago), que sigue disponible como respaldo.
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!esAdmin(session?.user?.email) || !session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { orderId, code } = await req.json();
    if (!orderId || !code) {
      return NextResponse.json({ error: "Faltan datos (orderId, code)" }, { status: 400 });
    }

    const admin = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!admin?.totpEnabled || !admin.totpSecret) {
      return NextResponse.json({ error: "El 2FA no está activado. Configúralo en /admin/2fa" }, { status: 400 });
    }
    if (!(await verificarCodigoTOTP(admin.totpSecret, code))) {
      return NextResponse.json({ error: "Código de verificación inválido" }, { status: 401 });
    }

    const orden = await prisma.order.findUnique({ where: { id: orderId } });
    if (!orden) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
    if (orden.metodoPago !== "USDT_BEP20") {
      return NextResponse.json({ error: "El desembolso automático solo aplica a pagos en USDT" }, { status: 400 });
    }
    if (orden.estado !== "COMPLETADO") {
      return NextResponse.json({ error: "La orden aún no está completada (entrega no confirmada)" }, { status: 400 });
    }
    if (orden.pagoLiberado) {
      return NextResponse.json({ error: "Este pago ya fue liberado" }, { status: 409 });
    }

    const producto = await prisma.product.findUnique({ where: { id: orden.productId } });
    if (!producto) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    const vendedor = await prisma.user.findUnique({ where: { id: producto.sellerId } });
    if (!vendedor?.usdtWallet) {
      return NextResponse.json({ error: "El vendedor no tiene una wallet USDT registrada" }, { status: 400 });
    }
    if (!esDireccionValida(vendedor.usdtWallet)) {
      return NextResponse.json({ error: "La wallet USDT del vendedor no es una dirección válida" }, { status: 400 });
    }

    // Monto correcto a pagar al vendedor: recibeVendedor (COP, = precio del producto, sin comisión)
    // convertido a USD con la tasa actual — NO se usa totalUSDT porque ese incluye la comisión de
    // Colbisnes y el colchón cambiario, que deben quedarse en la plataforma.
    let tasaCOP = 4200;
    try {
      const tasaRes = await fetch(`${process.env.NEXT_PUBLIC_URL || "https://colbisnes-web.vercel.app"}/api/tasa-usdt`);
      const tasaData = await tasaRes.json();
      if (tasaData.tasa && !isNaN(tasaData.tasa)) tasaCOP = tasaData.tasa;
    } catch { /* usar fallback */ }

    const amountUSD = parseFloat((orden.recibeVendedor / tasaCOP).toFixed(2));

    if (amountUSD > CAP_DIARIO_USD) {
      return NextResponse.json(
        { error: `El monto (${amountUSD} USD) supera el tope por transacción de ${CAP_DIARIO_USD} USD. Usa el flujo manual.` },
        { status: 400 }
      );
    }

    // Tope diario acumulado (ventana de 24h) sobre todos los desembolsos automáticos
    const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const pagosRecientes = await prisma.hotWalletPayout.findMany({ where: { createdAt: { gte: hace24h } } });
    const totalUltimas24h = pagosRecientes.reduce((sum, p) => sum + p.amountUSD, 0);
    if (totalUltimas24h + amountUSD > CAP_DIARIO_USD) {
      return NextResponse.json(
        { error: `Se superaría el tope diario de ${CAP_DIARIO_USD} USD (ya enviados ${totalUltimas24h.toFixed(2)} USD en 24h). Usa el flujo manual.` },
        { status: 400 }
      );
    }

    // Ejecuta la transferencia real en la blockchain
    const txHash = await enviarUSDT(vendedor.usdtWallet, amountUSD);

    const [ordenActualizada] = await prisma.$transaction([
      prisma.order.update({
        where: { id: orderId },
        data: { pagoLiberado: true, pagoLiberadoAt: new Date(), txHashPago: txHash, pagoAutomatico: true },
      }),
      prisma.hotWalletPayout.create({
        data: { orderId, amountUSD, toAddress: vendedor.usdtWallet, txHash },
      }),
      prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: "LIBERAR_PAGO_AUTO",
          entity: "Order",
          entityId: orderId,
          metadata: { amountUSD, toAddress: vendedor.usdtWallet, txHash },
        },
      }),
    ]);

    return NextResponse.json({ ok: true, orden: ordenActualizada, txHash, amountUSD });
  } catch (error: any) {
    console.error("Error en liberar-pago-auto:", error);
    return NextResponse.json({ error: error.message || "Error interno" }, { status: 500 });
  }
}
