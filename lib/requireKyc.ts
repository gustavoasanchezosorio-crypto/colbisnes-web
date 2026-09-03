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
 * DÓNDE VA ESTE CANDADO (decisión del 2026-09-02): solo donde hay plata o donde alguien
 * se expone públicamente como vendedor. Hoy son dos sitios:
 *
 *   · Publicar un producto  — quien ofrece algo a la comunidad y va a recibir un pago
 *                             nuestro tiene nombre y cédula. Sin excepción.
 *   · Los checkouts         — online, contra entrega y USDT.
 *
 * Y explícitamente NO va en mirar, ofertar, escribir mensajes, calificar ni confirmar la
 * entrega. Antes estaba en todos, y el efecto era que alguien que apenas llegaba a curiosear
 * se topaba de entrada con un muro de cédula y selfie. Pedir todo por adelantado no protege
 * más: solo espanta a quien todavía no ha hecho nada que proteger.
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
