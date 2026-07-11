import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { sendWhatsapp } from "@/lib/whatsapp";
import { colbisnesEmailTemplate } from "@/lib/emailTemplate";

function esAdmin(email: string) {
  return email?.toLowerCase() === process.env.ADMIN_EMAIL?.toLowerCase();
}

// Libera manualmente el pago al vendedor (flujo genérico: transferencia bancaria/Nequi/USDT
// hecha a mano por el admin fuera de la plataforma; txHash aquí es solo una referencia libre,
// no una transacción on-chain verificada). Antes esta ruta no validaba nada — cualquier orderId
// pasaba, sin importar el estado de la orden, y podía "liberarse" el mismo pago dos veces sin
// dejar rastro de quién lo hizo (auditoría 2026-07-06). Ahora exige que la entrega esté
// confirmada, rechaza si ya se había liberado, y deja un AuditLog igual que liberar-pago-auto.
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !esAdmin(session.user.email || "")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { orderId, txHash } = await req.json();
    if (!orderId) return NextResponse.json({ error: "orderId requerido" }, { status: 400 });

    const orden = await prisma.order.findUnique({ where: { id: orderId } });
    if (!orden) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
    if (orden.estado !== "COMPLETADO") {
      return NextResponse.json({ error: "La orden aún no está completada (entrega no confirmada)" }, { status: 400 });
    }
    if (orden.pagoLiberado) {
      return NextResponse.json({ error: "Este pago ya fue liberado" }, { status: 409 });
    }

    const [ordenActualizada] = await prisma.$transaction([
      prisma.order.update({
        where: { id: orderId },
        data: {
          pagoLiberado: true,
          pagoLiberadoAt: new Date(),
          txHashPago: txHash || null,
        },
      }),
      prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: "LIBERAR_PAGO_MANUAL",
          entity: "Order",
          entityId: orderId,
          metadata: { txHash: txHash || null },
        },
      }),
    ]);

    // Notificar al vendedor que su pago ya fue transferido (semi-automático: el admin hizo la
    // transferencia real por fuera y al marcarla, el sistema le avisa con el monto y el medio).
    // Nunca debe tumbar la liberación si el correo/WhatsApp falla.
    try {
      const producto = await prisma.product.findUnique({
        where: { id: orden.productId },
        select: {
          title: true,
          seller: { select: { name: true, email: true, phoneWhatsapp: true, nequiNumber: true, brebId: true } },
        },
      });
      const vendedor = producto?.seller;
      if (vendedor?.email) {
        const esUSDT = orden.metodoPago === "USDT_BEP20";
        const montoTxt = esUSDT
          ? `${orden.totalUSDT ?? ""} USDT`
          : `$${Number(orden.recibeVendedor).toLocaleString("es-CO")} COP`;
        const medio = esUSDT
          ? "tu wallet USDT"
          : (vendedor.nequiNumber ? `tu Nequi ${vendedor.nequiNumber}` : (vendedor.brebId ? `tu llave Bre-B ${vendedor.brebId}` : "tu medio de pago registrado"));
        const html = colbisnesEmailTemplate({
          preheader: "Tu pago fue liberado",
          titulo: "¡Tu pago fue liberado! 💸",
          cuerpo: `Hola ${vendedor.name || "Vendedor"}, ya te transferimos <strong style="color:#1F6BFF;">${montoTxt}</strong> por la venta de <strong>${producto?.title || "tu producto"}</strong> a ${medio}.<br/><br/>Si no ves el dinero reflejado en unos minutos, escríbenos y lo revisamos.`,
          ctaTexto: "Ver mis ventas",
          ctaUrl: "https://colbisnes.com",
        });
        await sendEmail({ to: vendedor.email, subject: "¡Tu pago fue liberado en Colbisnes!", html });
        await sendWhatsapp({
          to: (vendedor as any).phoneWhatsapp,
          body: `💸 *Colbisnes* - ¡Pago liberado!\n\nHola ${vendedor.name || "Vendedor"}, ya te transferimos ${montoTxt} por *${producto?.title || "tu producto"}* a ${medio}.\n\nSi no lo ves reflejado en unos minutos, avísanos.`,
        });
      }
    } catch (notifErr) {
      console.error("liberar-pago: no se pudo notificar al vendedor:", notifErr);
    }

    return NextResponse.json({ ok: true, orden: ordenActualizada });
  } catch (err: any) {
    console.error("Error en liberar-pago:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
