import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { normalizarTelefonoCO } from "@/lib/phone";

const SELECT_FIELDS = {
  id: true, name: true, email: true, phone: true, city: true, image: true,
  nequiNumber: true, brebId: true, createdAt: true,
  phoneWhatsapp: true, usdtWallet: true, usdtRed: true, direccionEnvio: true,
};

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: SELECT_FIELDS,
    });
    return NextResponse.json(user);
  } catch (error) {
    console.error("GET /api/user error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await request.json();
    const campos = ["name", "phone", "city", "image", "nequiNumber", "brebId", "phoneWhatsapp", "usdtWallet", "usdtRed", "direccionEnvio"];

    const updateData: any = {};
    for (const campo of campos) {
      if (body[campo] !== undefined) updateData[campo] = body[campo];
    }

    // Evita evadir un bloqueo por incumplimiento de envío registrando el mismo número de
    // celular/WhatsApp (con deuda pendiente) en una cuenta nueva o distinta.
    const numerosNuevos = [updateData.phone, updateData.phoneWhatsapp]
      .filter((n): n is string => !!n && typeof n === "string" && n.trim().length > 0)
      .map((n) => normalizarTelefonoCO(n));
    if (numerosNuevos.length > 0) {
      const enListaNegra = await prisma.blacklist.findFirst({
        where: { telefono: { in: numerosNuevos }, activo: true, deudaPendienteCOP: { gt: 0 } },
      });
      if (enListaNegra) {
        return NextResponse.json(
          { error: "Este número está asociado a una deuda pendiente con Colbisnes. Contacta a soporte para regularizar tu situación." },
          { status: 403 }
        );
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: updateData,
      select: SELECT_FIELDS,
    });
    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error("PATCH /api/user error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
