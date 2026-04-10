import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    console.log("Webhook KYC recibido:", payload);

    if (payload.status === 'decision' && payload.data) {
      const { userId, verification } = payload.data;
      if (!userId) {
        console.error("No se recibió userId en el webhook");
        return NextResponse.json({ error: "userId requerido" }, { status: 400 });
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        console.error(`Usuario no encontrado: ${userId}`);
        return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
      }

      if (verification.status === 'approved') {
        await prisma.user.update({
          where: { id: userId },
          data: {
            kycStatus: "approved",
            kycLevel: 2,
            kycApprovedAt: new Date(),
          },
        });
        console.log(`Usuario ${userId} verificado correctamente`);
      } else {
        await prisma.user.update({
          where: { id: userId },
          data: {
            kycStatus: "rejected",
            kycRejectedAt: new Date(),
          },
        });
        console.log(`Usuario ${userId} rechazado`);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error en webhook KYC:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
