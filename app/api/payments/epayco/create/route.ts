import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import axios from "axios";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { productId } = await request.json();
    if (!productId) {
      return NextResponse.json({ error: "productId requerido" }, { status: 400 });
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { seller: true, offers: { where: { status: "ACCEPTED" }, include: { user: true } } },
    });

    if (!product || product.status !== "PAYMENT_PENDING") {
      return NextResponse.json({ error: "Producto no disponible para pago" }, { status: 400 });
    }

    const acceptedOffer = product.offers[0];
    if (!acceptedOffer || acceptedOffer.userId !== session.user.id) {
      return NextResponse.json({ error: "No eres el comprador de este producto" }, { status: 403 });
    }

    // Credenciales desde .env
    const publicKey = process.env.EPAYCO_PUBLIC_KEY;
    const privateKey = process.env.EPAYCO_PRIVATE_KEY;
    const custId = process.env.EPAYCO_P_CUST_ID_CLIENTE;

    if (!publicKey || !privateKey || !custId) {
      console.error("Faltan variables de entorno de Epayco");
      return NextResponse.json({ error: "Error de configuración" }, { status: 500 });
    }

    // Autenticación básica con P_CUST_ID_CLIENTE y P_KEY (private key)
    const auth = Buffer.from(`${custId}:${privateKey}`).toString("base64");

    const payload = {
      name: product.title,
      description: product.description.substring(0, 100),
      currency: "COP",
      amount: product.priceCOP,
      tax: 0,
      tax_base: 0,
      country: "CO",
      lang: "es",
      external: false,
      confirmation: `${process.env.NEXTAUTH_URL}/api/payments/epayco/webhook`,
      response: `${process.env.NEXTAUTH_URL}/payment/result`,
      extra1: productId,
      extra2: session.user.id,
      name_billing: session.user.name || "Comprador",
      address_billing: "N/A",
      type_doc_billing: "cc",
      mobilephone_billing: "3000000000",
      number_doc_billing: "1234567890",
    };

    const response = await axios.post(
      "https://api.epayco.co/v1/payment/session/create",
      payload,
      { headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" } }
    );

    if (response.data.status === "ok" && response.data.data?.sessionId) {
      return NextResponse.json({ success: true, sessionId: response.data.data.sessionId });
    } else {
      throw new Error(response.data.message || "Error al crear sesión de pago");
    }
  } catch (error) {
    console.error("Error en /api/payments/epayco/create:", error);
    const errorMessage = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
