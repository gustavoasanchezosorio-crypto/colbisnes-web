const WOMPI_API_URL = process.env.WOMPI_API_URL || "https://sandbox.wompi.co/v1";
const WOMPI_PRIVATE_KEY = process.env.WOMPI_PRIVATE_KEY!;
const WOMPI_PUBLIC_KEY = process.env.WOMPI_PUBLIC_KEY!;
const WOMPI_INTEGRITY_SECRET = process.env.WOMPI_INTEGRITY_SECRET!;

async function generarFirma(reference: string, amountInCents: number, currency: string): Promise<string> {
  const cadena = `${reference}${amountInCents}${currency}${WOMPI_INTEGRITY_SECRET}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(cadena);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function obtenerAcceptanceToken(): Promise<string> {
  const res = await fetch(`${WOMPI_API_URL}/merchants/${WOMPI_PUBLIC_KEY}`);
  const data = await res.json();
  return data.data.presigned_acceptance.acceptance_token;
}

export async function crearTransaccionWompi({
  amountInCents,
  currency = "COP",
  customerEmail,
  reference,
  paymentMethod,
}: {
  amountInCents: number;
  currency?: string;
  customerEmail: string;
  reference: string;
  paymentMethod: { type: "NEQUI" | "PSE" | "CARD"; phone_number?: string; token?: string; };
}) {
  const [acceptance_token, signature] = await Promise.all([
    obtenerAcceptanceToken(),
    generarFirma(reference, amountInCents, currency),
  ]);

  const response = await fetch(`${WOMPI_API_URL}/transactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${WOMPI_PRIVATE_KEY}`,
    },
    body: JSON.stringify({
      amount_in_cents: amountInCents,
      currency,
      customer_email: customerEmail,
      reference,
      acceptance_token,
      signature,
      payment_method: paymentMethod,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    console.error("Wompi error:", JSON.stringify(data));
    throw new Error(JSON.stringify(data?.error?.messages) || "Error Wompi");
  }
  return data.data;
}

export async function consultarTransaccion(transactionId: string) {
  const res = await fetch(`${WOMPI_API_URL}/transactions/${transactionId}`, {
    headers: { Authorization: `Bearer ${WOMPI_PRIVATE_KEY}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error("Error al consultar transacción");
  return data.data;
}

export function generarReferencia(productId: string, userId: string): string {
  return `colbisnes-${productId}-${userId}-${Date.now()}`;
}

export function copACentavos(precioCOP: number): number {
  return Math.round(precioCOP * 100);
}

export { WOMPI_PUBLIC_KEY };
