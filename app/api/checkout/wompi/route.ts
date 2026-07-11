import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prepararOrdenOnline } from "@/lib/checkoutOnline";

export async function GET(req: NextRequest) {
  try {
    // Base pública para construir redirects. NO usar req.url: detrás del proxy de Railway
    // apunta a http://localhost:3000 (host interno), lo que hacía que el navegador fuera
    // redirigido a localhost → ERR_CONNECTION_REFUSED (parecía que la página se caía).
    const publicBase = process.env.NEXT_PUBLIC_URL || "https://colbisnes.com";

    const productoId = req.nextUrl.searchParams.get("productoId") || "";
    const proteccionExtendida = req.nextUrl.searchParams.get("proteccion") === "1";

    const prep = await prepararOrdenOnline(productoId, proteccionExtendida);
    if (!prep.ok) {
      // Los guards de perfil redirigen al flujo que corresponda; el resto devuelve JSON.
      switch (prep.code) {
        case "kyc":               return NextResponse.redirect(new URL("/kyc", publicBase));
        case "emailVerification": return NextResponse.redirect(new URL("/auth/verify", publicBase));
        case "antiPhishing":      return NextResponse.redirect(new URL("/perfil/editar", publicBase));
        case "payout":            return NextResponse.redirect(new URL("/perfil/editar?falta=pago", publicBase));
        default:                  return NextResponse.json({ error: prep.message || "No se pudo iniciar el pago" }, { status: prep.status });
      }
    }
    const orden = prep.orden;

    const referencia: string = "colbisnes" + orden.id.replace(/[^a-zA-Z0-9]/g, "") + Date.now();
    const montoEnCentavos: string = String(Math.round(orden.totalPagado * 100));
    const moneda: string = "COP";
    // .trim() defensivo: si el secreto se pegó en Railway con un salto de línea o espacio
    // invisible al final, la firma SHA256 sale mal y Wompi responde "La firma es inválida".
    const secretoIntegridad: string = (process.env.WOMPI_INTEGRITY_SECRET || "").trim();
    const publicKey: string = (process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY || "").trim();

    if (!secretoIntegridad) throw new Error("WOMPI_INTEGRITY_SECRET no está configurado");
    if (!publicKey) throw new Error("NEXT_PUBLIC_WOMPI_PUBLIC_KEY no está configurado");

    const cadenaConcatenada: string = referencia + montoEnCentavos + moneda + secretoIntegridad;
    const firma: string = crypto.createHash("sha256").update(cadenaConcatenada, "utf8").digest("hex");

    const baseUrl = process.env.NEXT_PUBLIC_URL || "https://colbisnes.com";
    const redirectUrl = baseUrl + "/checkout/confirmacion?orderId=" + orden.id;

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
    console.error("Error en checkout Wompi:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
