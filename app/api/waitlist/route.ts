// app/api/waitlist/route.ts
//
// Alta en la lista de espera del prelanzamiento. Lo consume el formulario de
// /coming-soon, y lo que se guarda aquí es exactamente lo que leerá
// scripts/send-launch-emails.ts el día de la apertura.
//
// Es público a la fuerza: mientras el sitio está en modo coming-soon no hay
// sesión de nadie, así que no puede exigir autenticación. Eso obliga a tres
// cuidados que están abajo: límite por IP, validación estricta de la entrada y
// no revelar si un correo ya estaba apuntado.
//
// Nota sobre por qué esto funciona con el candado puesto: el matcher del
// middleware EXCLUYE /api ("/((?!api|_next/static|...).*)"), así que la
// redirección a /coming-soon no se le aplica a esta ruta. Si alguna vez se
// cambia ese matcher para incluir /api, hay que acordarse de dejar pasar
// /api/waitlist o el formulario dejará de funcionar justo cuando más sirve.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, getIP } from "@/lib/rateLimit";

// Tope de RFC 5321 para una dirección completa. Sirve de cortafuegos barato
// contra payloads absurdos antes de tocar la base de datos.
const MAX_EMAIL = 254;

// Validación deliberadamente simple. Una expresión regular no decide si un
// correo existe —eso solo lo dice mandarle algo—, así que solo descarta lo que
// es basura evidente. Ser más estricto aquí solo consigue rechazar direcciones
// legítimas raras pero válidas.
const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Mismo mensaje tanto si el correo es nuevo como si ya estaba. Si respondiera
// "ya estás apuntado", cualquiera podría usar el formulario para averiguar si
// una dirección concreta está en la lista.
const MENSAJE_OK = "¡Listo! Te avisamos apenas abramos.";

export async function POST(request: Request) {
  try {
    // 5 altas por hora y por IP. Nadie se apunta cinco veces a una lista de
    // espera; da margen de sobra a una casa u oficina que comparta salida y
    // corta en seco el registro masivo con un script.
    const ip = getIP(request);
    const rl = rateLimit(`waitlist:${ip}`, { limit: 5, windowSeconds: 3600 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Demasiados intentos. Inténtalo de nuevo en un rato." },
        { status: 429 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Petición inválida." }, { status: 400 });
    }

    const crudo = (body as { email?: unknown })?.email;
    if (typeof crudo !== "string") {
      return NextResponse.json({ error: "Falta el correo." }, { status: 400 });
    }

    const email = crudo.trim().toLowerCase();

    if (!email || email.length > MAX_EMAIL || !FORMATO_EMAIL.test(email)) {
      return NextResponse.json(
        { error: "Ese correo no parece válido." },
        { status: 400 }
      );
    }

    // upsert en vez de create: apuntarse dos veces no es un error, es alguien
    // que no se acordaba. Además evita la carrera de dos envíos simultáneos
    // desde la misma pestaña (doble clic), que con un create suelto reventaría
    // con P2002.
    await prisma.waitlist.upsert({
      where: { email },
      create: { email },
      update: {}, // ya estaba: no se toca el createdAt original
    });

    return NextResponse.json({ ok: true, mensaje: MENSAJE_OK });
  } catch (e) {
    // El detalle va a los logs del servidor, nunca a la respuesta: en un
    // endpoint público el mensaje de error de la base de datos le regala a un
    // desconocido pistas sobre el esquema y la infraestructura.
    console.error("POST /api/waitlist:", e);
    return NextResponse.json(
      { error: "No pudimos guardarte ahora mismo. Inténtalo en un momento." },
      { status: 500 }
    );
  }
}
