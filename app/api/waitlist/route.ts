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
import { sendEmail } from "@/lib/email";
import {
  ASUNTO_BIENVENIDA,
  CONTACTO_BIENVENIDA,
  htmlBienvenida,
  textoBienvenida,
  urlEntrarAnticipado,
} from "@/lib/correoBienvenida";
import {
  COOKIE_BYPASS,
  COOKIE_MODO_PRUEBA_UI,
  prelanzamientoActivo,
} from "@/lib/modoPrueba";

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
//
// Antes decía "en un minuto te llega tu acceso al correo", y era mentira a
// medias: a quien ya estaba apuntado NO se le reenvía nada (rama P2002), así
// que se quedaba mirando la bandeja. Ahora el acceso lo entrega esta misma
// respuesta en forma de cookie —ver el final de POST—, así que el mensaje puede
// ser literal y, además, cierto por igual en los dos casos.
const MENSAJE_OK = "¡Listo! Ya tienes acceso.";

// Duración de las cookies de acceso: la misma que pone el middleware al abrir
// el enlace secreto. Si aquí y allí no coincidieran, un mismo navegador tendría
// dos caducidades distintas según por dónde entró.
const DIAS_DE_ACCESO = 60 * 60 * 24 * 30;

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

    // create + captura de P2002 en vez de upsert. El upsert guardaba bien, pero
    // no sabía decir si acababa de crear el registro o si ya estaba, y aquí esa
    // diferencia importa: el correo de bienvenida SOLO puede salir en un alta
    // nueva.
    //
    // No es una cuestión de elegancia. Este endpoint es público y sin sesión a
    // la fuerza (mientras el sitio está en coming-soon no hay usuarios), así que
    // cualquiera puede meter la dirección de otro. Si mandara correo en cada
    // POST, el formulario se convertiría en un aparato de acoso: hasta 5 correos
    // por hora a un tercero, dentro del límite. Enviando solo la primera vez, el
    // peor caso es un único correo.
    //
    // La carrera del doble clic sigue cubierta: de dos peticiones simultáneas,
    // una crea y la otra recibe P2002, así que tampoco salen dos correos.
    let esAltaNueva = true;
    try {
      await prisma.waitlist.create({ data: { email } });
    } catch (e: unknown) {
      const codigo = (e as { code?: string })?.code;
      if (codigo === "P2002") {
        // Ya estaba apuntado. No se toca su createdAt y no se reenvía nada.
        esAltaNueva = false;
      } else {
        throw e; // cualquier otro fallo de base de datos sí es un 500 de verdad
      }
    }

    // El correo va DESPUÉS de guardar y nunca puede tumbar el alta. Perder una
    // dirección porque Resend tuvo un mal minuto sería mucho peor que no mandar
    // el correo: la dirección no se puede recuperar, el correo se puede reenviar.
    // sendEmail ya captura sus propios errores, pero se envuelve igual por si en
    // el futuro cambia ese comportamiento.
    if (esAltaNueva) {
      try {
        // El enlace de acceso anticipado se calcula UNA vez y se pasa a las dos
        // versiones del correo, para que el HTML y el texto plano no puedan
        // acabar apuntando a sitios distintos.
        const urlEntrar = urlEntrarAnticipado();
        await sendEmail({
          to: email,
          subject: ASUNTO_BIENVENIDA,
          html: htmlBienvenida(urlEntrar),
          text: textoBienvenida(urlEntrar),
          replyTo: CONTACTO_BIENVENIDA,
          // Gmail y Outlook puntúan mejor el correo no transaccional que ofrece
          // una salida clara. Es el mismo mecanismo de baja que usa el envío del
          // día del lanzamiento.
          headers: {
            "List-Unsubscribe": `<mailto:${CONTACTO_BIENVENIDA}?subject=BAJA>`,
          },
        });
      } catch (e) {
        console.error("waitlist: falló el correo de bienvenida para", email, e);
      }
    }

    // ACCESO INMEDIATO (2026-08-05).
    //
    // Hasta hoy la única llave era el enlace `?acceso=CÓDIGO` del correo de
    // bienvenida, y eso dejó fuera a 9 de las 11 personas apuntadas: se
    // apuntaron ANTES de que ese enlace existiera (2026-08-03), su correo no lo
    // llevaba, y volver a apuntarse no reenvía nada (rama P2002 de arriba).
    // Estaban atrapadas sin ninguna salida.
    //
    // Ahora la llave la entrega esta misma respuesta. Las dos cookies son
    // exactamente las que fija middleware.ts en su paso 1 al abrir el enlace
    // secreto —mismos nombres, mismos flags, misma caducidad—, así que para el
    // resto de la app este visitante es indistinguible de uno que llegó por el
    // correo. Cuatro consecuencias buscadas:
    //
    //   · las 9 atascadas entran volviendo a escribir su correo, sin reenvíos
    //     ni panel de admin: la rama P2002 también desemboca aquí;
    //   · LAUNCH_BYPASS_CODE no viaja en el cuerpo ni en la URL. El navegador
    //     recibe el permiso; el código nunca sale del servidor;
    //   · dejar el correo sigue siendo obligatorio para entrar, así que la lista
    //     del envío del 12 de agosto se sigue llenando en vez de vaciarse;
    //   · el límite de 5/hora por IP de arriba pasa a limitar también el reparto
    //     de accesos, gratis.
    //
    // Se apaga solo: fuera de la ventana de prelanzamiento no hay candado que
    // abrir, y el middleware ya limpia la marca de UI que quedara suelta.
    const res = NextResponse.json({ ok: true, mensaje: MENSAJE_OK });

    if (prelanzamientoActivo()) {
      // `secure` NO se puede deducir de request.url: detrás del proxy de Railway
      // la URL interna es http://localhost:3000, y la cookie saldría sin la
      // marca `secure` en producción. Se deduce del dominio público, que es el
      // que de verdad ve el navegador (mismo criterio que /api/checkout/wompi).
      const seguro = (process.env.NEXT_PUBLIC_URL || "https://colbisnes.com").startsWith("https:");
      const comunes = { sameSite: "lax" as const, secure: seguro, path: "/", maxAge: DIAS_DE_ACCESO };

      // La que abre el candado de verdad. httpOnly: ningún script la puede leer.
      res.cookies.set(COOKIE_BYPASS, "1", { ...comunes, httpOnly: true });
      // Solo para que el banner amarillo sepa pintarse. No otorga permiso alguno.
      res.cookies.set(COOKIE_MODO_PRUEBA_UI, "1", { ...comunes, httpOnly: false });
    }

    return res;
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
