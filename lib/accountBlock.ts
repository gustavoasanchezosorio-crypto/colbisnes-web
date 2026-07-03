import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export interface EstadoBloqueo {
  bloqueado: boolean;
  motivo?: string;
  blockedUntil?: Date | null;
  deudaPendienteCOP: number;
}

// Verifica si un usuario tiene bloqueo activo (por tiempo) o deuda pendiente con Colbisnes.
// Ambas condiciones impiden comprar y vender mientras estén activas.
export async function verificarBloqueo(userId: string): Promise<EstadoBloqueo> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { blockedUntil: true, blockedReason: true, deudaPendienteCOP: true },
  });
  if (!user) return { bloqueado: false, deudaPendienteCOP: 0 };

  const bloqueadoPorTiempo = !!user.blockedUntil && user.blockedUntil.getTime() > Date.now();
  const bloqueadoPorDeuda = (user.deudaPendienteCOP || 0) > 0;

  return {
    bloqueado: bloqueadoPorTiempo || bloqueadoPorDeuda,
    motivo: user.blockedReason || undefined,
    blockedUntil: user.blockedUntil,
    deudaPendienteCOP: user.deudaPendienteCOP || 0,
  };
}

// Helper para usar directamente en rutas API: retorna una NextResponse de error 403 si el usuario
// está bloqueado, o null si puede continuar.
export async function bloqueoResponse(userId: string): Promise<NextResponse | null> {
  const estado = await verificarBloqueo(userId);
  if (!estado.bloqueado) return null;

  const partes: string[] = [];
  if (estado.blockedUntil && estado.blockedUntil.getTime() > Date.now()) {
    partes.push(`Tu cuenta está bloqueada hasta ${estado.blockedUntil.toLocaleString("es-CO")}`);
  }
  if (estado.deudaPendienteCOP > 0) {
    partes.push(`Tienes una deuda pendiente de $${estado.deudaPendienteCOP.toLocaleString("es-CO")} COP con Colbisnes`);
  }
  const motivo = estado.motivo ? ` (${estado.motivo})` : "";

  return NextResponse.json(
    {
      error: `No puedes comprar ni vender en este momento. ${partes.join(" y ")}${motivo}. Contacta a soporte para regularizar tu situación.`,
      bloqueado: true,
      deudaPendienteCOP: estado.deudaPendienteCOP,
      blockedUntil: estado.blockedUntil,
    },
    { status: 403 }
  );
}
