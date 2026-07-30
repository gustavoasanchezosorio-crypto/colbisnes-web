// app/api/health/route.ts
//
// Endpoint de salud, creado el 2026-07-30 de cara al lanzamiento.
//
// Lo van a consultar dos cosas distintas:
//   - El healthcheck de Railway, que decide si un despliegue nuevo entra a
//     servir tráfico o se descarta y se queda el anterior.
//   - Un monitor externo tipo UptimeRobot, que avisa si el sitio se cayó.
//
// No basta con devolver 200 a secas. Un proceso vivo que no puede consultar la
// base de datos está "arriba" pero no sirve para nada: no hay login, ni
// productos, ni checkout. Por eso se comprueba la dependencia que de verdad
// importa, con la consulta más barata posible.
//
// Es público a propósito: un healthcheck que exige credenciales no sirve como
// healthcheck. Pero no revela nada — ante un fallo devuelve {status:"error"} y
// punto. El detalle del error va a los logs del servidor, nunca a la respuesta,
// para no regalarle a un desconocido pistas sobre la infraestructura.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Si la base de datos no contesta en este plazo, se considera caída. Un
// healthcheck que se queda colgado es peor que uno que falla: Railway se queda
// esperando en vez de detectar el problema y actuar.
const TIMEOUT_MS = 5000;

const SIN_CACHE = { "Cache-Control": "no-store, max-age=0" };

export async function GET() {
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`La base de datos no respondió en ${TIMEOUT_MS} ms`)), TIMEOUT_MS)
      ),
    ]);

    return NextResponse.json(
      { status: "ok", timestamp: new Date().toISOString() },
      { headers: SIN_CACHE }
    );
  } catch (e) {
    console.error("GET /api/health: la base de datos no respondió:", e);
    return NextResponse.json({ status: "error" }, { status: 503, headers: SIN_CACHE });
  }
}
