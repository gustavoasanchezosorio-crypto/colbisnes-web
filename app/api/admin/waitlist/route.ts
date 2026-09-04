// app/api/admin/waitlist/route.ts
//
// La lista de espera vista desde el panel. Existe porque hasta ahora era el
// único dato del negocio que no se podía mirar desde ningún sitio: el modelo
// Waitlist se creó para el prelanzamiento, lo escribe /api/waitlist, lo leerá
// scripts/send-launch-emails.ts el día 12, y entre medias nadie podía saber
// cuánta gente había ni qué estaba haciendo.
//
// Lo que de verdad importa aquí NO es el total, es la conversión. Desde el
// acceso anticipado (2026-08-03) apuntarse ya no es "esperar": el correo de
// bienvenida trae el enlace que abre el candado, así que quien se apunta PUEDE
// entrar y publicar hoy mismo. La distancia entre "apuntados" y "entraron de
// verdad" es la medida de si eso funciona, y es lo que devuelve este endpoint.

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { comingSoonActivo } from "@/lib/launch";
import { esAdminSession } from "@/lib/adminAuth";

// Tope de filas. La lista de espera hoy son 11 direcciones, pero si la campaña
// funciona esto puede crecer rápido y el panel no debe intentar pintar miles de
// filas de golpe. El total va aparte, contado en la base de datos, así que el
// número grande sigue siendo exacto aunque la tabla venga recortada.
const MAX_FILAS = 500;

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !esAdminSession(session)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [total, ultimas24h, filas] = await Promise.all([
      prisma.waitlist.count(),
      prisma.waitlist.count({ where: { createdAt: { gte: hace24h } } }),
      prisma.waitlist.findMany({
        orderBy: { createdAt: "desc" },
        take: MAX_FILAS,
        select: { id: true, email: true, createdAt: true },
      }),
    ]);

    // Cruce con usuarios reales. Waitlist NO tiene relación con User —son dos
    // tablas independientes y el único vínculo es el correo—, así que el cruce
    // se hace aquí a mano con un IN sobre las direcciones que sí vamos a pintar.
    const correos = filas.map((f) => f.email);
    const usuarios = correos.length
      ? await prisma.user.findMany({
          where: { email: { in: correos } },
          select: {
            email: true,
            createdAt: true,
            _count: { select: { products: true } },
          },
        })
      : [];

    // Mapa por correo para no hacer un find() por fila (O(n²) con listas largas).
    const porCorreo = new Map(usuarios.map((u) => [u.email.toLowerCase(), u]));

    const lista = filas.map((f) => {
      const u = porCorreo.get(f.email.toLowerCase());
      return {
        id: f.id,
        email: f.email,
        createdAt: f.createdAt,
        tieneCuenta: Boolean(u),
        productos: u?._count.products ?? 0,
      };
    });

    const conCuenta = lista.filter((l) => l.tieneCuenta).length;
    const publicaron = lista.filter((l) => l.productos > 0).length;

    return NextResponse.json({
      total,
      ultimas24h,
      conCuenta,
      publicaron,
      lista,
      // Estado del candado. Lo tiene que resolver el servidor porque depende de
      // la variable de entorno COMING_SOON, que el navegador no puede leer.
      //
      // OJO: aquí NO va, ni puede ir nunca, LAUNCH_BYPASS_CODE. El panel enseña
      // si el candado está puesto, no la llave.
      candadoActivo: comingSoonActivo(Date.now(), process.env.COMING_SOON),
    });
  } catch (error) {
    // Igual que en el resto del panel: el detalle a los logs, nunca al cliente.
    console.error("GET /api/admin/waitlist:", error);
    return NextResponse.json(
      { error: "No se pudo cargar la lista de espera." },
      { status: 500 }
    );
  }
}
