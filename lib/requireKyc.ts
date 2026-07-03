import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const KYC_ERROR = {
  error: "Debes verificar tu identidad antes de continuar. Ve a colbisnes.com/kyc",
  kycRequired: true,
};

/**
 * Verifica que el usuario esté autenticado Y tenga KYC aprobado.
 * Retorna { session } si todo está bien, o { response } con el error HTTP listo para retornar.
 *
 * Uso:
 *   const { session, response } = await requireKyc();
 *   if (response) return response;
 */
export async function requireKyc(): Promise<
  | { session: Awaited<ReturnType<typeof getServerSession>> & { user: { id: string; email: string; name?: string | null } }; response?: undefined }
  | { response: NextResponse; session?: undefined }
> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !session?.user?.email) {
    return {
      response: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { kycStatus: true },
  });

  if (!user || user.kycStatus !== "approved") {
    return {
      response: NextResponse.json(KYC_ERROR, { status: 403 }),
    };
  }

  return { session: session as any };
}
