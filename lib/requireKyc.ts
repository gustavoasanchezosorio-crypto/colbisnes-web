import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const KYC_ERROR = {
  error: "Debes verificar tu identidad antes de continuar. Ve a colbisnes.com/kyc",
  kycRequired: true,
};

type SesionConUsuario = Awaited<ReturnType<typeof getServerSession>> & {
  user: { id: string; email: string; name?: string | null };
};

type Resultado =
  | { session: SesionConUsuario; response?: undefined }
  | { response: NextResponse; session?: undefined };

/**
 * Solo exige estar con sesión iniciada. NO mira la verificación de identidad.
 *
 * Existe desde el 2026-09-02, cuando se movió el candado del documento (ver abajo). Antes
 * la única forma de pedir sesión era llamar a requireKyc(), que de paso exigía el KYC — así
 * que quitar el KYC de un endpoint significaba dejarlo sin autenticación por accidente.
 * Separarlo hace que ese error sea imposible de cometer en silencio.
 */
export async function requireSesion(): Promise<Resultado> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !session?.user?.email) {
    return {
      response: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    };
  }

  return { session: session as SesionConUsuario };
}

/**
 * Exige sesión iniciada Y verificación de identidad aprobada.
 *
 * DÓNDE VA ESTE CANDADO (actualizado 2026-10-26, reemplaza la decisión del 2026-09-02):
 * solo quien se expone públicamente como vendedor y va a recibir plata nuestra.
 *
 *   · Publicar un producto  — quien ofrece algo a la comunidad y va a recibir un pago
 *                             nuestro tiene nombre y cédula. Sin excepción.
 *
 * Y explícitamente YA NO va en los checkouts (online, contra entrega, USDT): el COMPRADOR
 * no necesita identidad verificada para pagar. La garantía de la compra es el propio
 * escrow/custodia del pago (el dinero no se libera al vendedor hasta confirmar la entrega),
 * no el documento de quien compra — exigírselo solo era fricción sin proteger nada que el
 * escrow no protegiera ya. Los tres checkouts (app/api/checkout/contra-entrega/route.ts,
 * app/api/checkout/usdt/route.ts, lib/checkoutOnline.ts) llaman ahora a requireSesion().
 * Tampoco va, como antes, en mirar, ofertar, escribir mensajes, calificar ni confirmar la
 * entrega. Pedir identidad por adelantado o de más no protege más: solo espanta a quien
 * todavía no ha hecho nada que proteger.
 *
 * Esta función queda disponible (no se usa hoy en ningún endpoint) por si en el futuro algún
 * flujo nuevo necesita volver a exigir KYC a un comprador — p. ej. compras de monto muy alto.
 *
 * Uso:
 *   const { session, response } = await requireKyc();
 *   if (response) return response;
 */
export async function requireKyc(): Promise<Resultado> {
  const base = await requireSesion();
  if (base.response) return base;

  const user = await prisma.user.findUnique({
    where: { id: base.session.user.id },
    select: { kycStatus: true },
  });

  if (!user || user.kycStatus !== "approved") {
    return {
      response: NextResponse.json(KYC_ERROR, { status: 403 }),
    };
  }

  return { session: base.session };
}
