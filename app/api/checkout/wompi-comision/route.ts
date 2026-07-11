import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import crypto from "crypto";

// Pago de la COMISIÓN DE RESERVA de un pedido contra-entrega usando el checkout web de Wompi
// (Nequi / Bre-B / etc., según lo que tenga habilitado la cuenta de comercio). Es la alternativa
// automática al método manual (transferencia Nequi + confirmación del admin), que se mantiene
// como respaldo. El webhook /api/webhooks/wompi reconoce la referencia con prefijo "comision"
// y, al aprobarse, marca la comisión como pagada y pasa el producto a IN_ESCROW.
export async function GET(req: NextRequest) {
  try {
    const publicBase = process.env.NEXT_PUBLIC_URL || "https://colbisnes.com";

    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.redirect(new URL("/auth/login", publicBase));
    }

    const ordenId = req.nextUrl.searchParams.get("ordenId");
    if (!ordenId) return NextResponse.json({ error: "ordenId requerido" }, { status: 400 });

    const orden = await prisma.order.findUnique({ where: { id: ordenId } });
    if (!orden) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });

    // Solo el comprador de esta orden puede pagar su comisión.
    if (orden.buyerEmail.toLowerCase() !== session.user.email.toLowerCase()) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    if (orden.estado !== "ESPERANDO_COMISION") {
      return NextResponse.json({ error: "Esta orden no está esperando el pago de la comisión" }, { status: 400 });
    }
    if (orden.comisionReservaPagada) {
      return NextResponse.json({ error: "La comisión de esta orden ya fue pagada" }, { status: 400 });
    }
    if (!orden.comisionReservaCOP || orden.comisionReservaCOP <= 0) {
      return NextResponse.json({ error: "Esta orden no tiene una comisión válida por cobrar" }, { status: 400 });
    }

    // El producto debe seguir reservado para este pedido (PAYMENT_PENDING). Si expiró o siguió
    // otro camino, no iniciamos un cobro que luego no podríamos honrar correctamente.
    const producto = await prisma.product.findUnique({ where: { id: orden.productId } });
    if (!producto || producto.status !== "PAYMENT_PENDING") {
      return NextResponse.json(
        { error: `El producto ya no está reservado para este pedido (estado: ${producto?.status ?? "no encontrado"}).` },
        { status: 409 }
      );
    }

    // Referencia con prefijo "comision" para que el webhook la enrute a la lógica de comisión y
    // NO al flujo de pago completo. Formato: "comision" + orden.id (sin caracteres no alfanuméricos)
    // + timestamp (13 dígitos), igual que el pago online, para poder recortar el id de vuelta.
    const referencia: string = "comision" + orden.id.replace(/[^a-zA-Z0-9]/g, "") + Date.now();
    const montoEnCentavos: string = String(Math.round(orden.comisionReservaCOP * 100));
    const moneda: string = "COP";

    const secretoIntegridad: string = (process.env.WOMPI_INTEGRITY_SECRET || "").trim();
    const publicKey: string = (process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY || "").trim();
    if (!secretoIntegridad) throw new Error("WOMPI_INTEGRITY_SECRET no está configurado");
    if (!publicKey) throw new Error("NEXT_PUBLIC_WOMPI_PUBLIC_KEY no está configurado");

    const cadenaConcatenada: string = referencia + montoEnCentavos + moneda + secretoIntegridad;
    const firma: string = crypto.createHash("sha256").update(cadenaConcatenada, "utf8").digest("hex");

    // Guardamos la referencia usada para poder rastrear/cruzar el pago con esta orden.
    await prisma.order.update({
      where: { id: orden.id },
      data: { comisionReservaReferencia: referencia },
    });

    const redirectUrl = publicBase + "/checkout/confirmacion?orderId=" + orden.id;

    const wompiUrl =
      "https://checkout.wompi.co/p/" +
      "?public-key=" + encodeURIComponent(publicKey) +
      "&currency=" + encodeURIComponent(moneda) +
      "&amount-in-cents=" + encodeURIComponent(montoEnCentavos) +
      "&reference=" + encodeURIComponent(referencia) +
      "&signature:integrity=" + encodeURIComponent(firma) +
      "&redirect-url=" + encodeURIComponent(redirectUrl);

    return NextResponse.redirect(wompiUrl);
  } catch (err: any) {
    console.error("Error en checkout Wompi comisión:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
