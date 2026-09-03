import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, getIP } from "@/lib/rateLimit";
import { sendEmail } from "@/lib/email";
import {
  ASUNTO_BIENVENIDA,
  CONTACTO_BIENVENIDA,
  htmlBienvenida,
  textoBienvenida,
} from "@/lib/correoBienvenida";
import crypto from "crypto";

// POST /api/auth/verify — confirma el correo de un usuario a partir del token del email.
// El enlace del correo apunta a /auth/verify?token=... (página) que a su vez llama aquí.
export async function POST(req: NextRequest) {
  try {
    const ip = getIP(req);
    const rl = rateLimit(`verify-email:${ip}`, { limit: 10, windowSeconds: 300 });
    if (!rl.allowed) {
      return NextResponse.json({ error: "Demasiados intentos. Intenta en unos minutos." }, { status: 429 });
    }

    const { token } = await req.json();
    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Token requerido" }, { status: 400 });
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await prisma.user.findFirst({
      where: { emailVerifyToken: hashedToken, emailVerifyTokenExpiry: { gt: new Date() } },
    });

    if (!user) {
      // Puede ser un token ya usado (limpiado) o expirado. No revelamos cuál.
      return NextResponse.json({ error: "Enlace inválido o expirado. Solicita uno nuevo." }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: new Date(), emailVerifyToken: null, emailVerifyTokenExpiry: null },
    });

    // BIENVENIDA (2026-09-02). Este es el momento en que alguien queda de verdad
    // dentro, y hasta hoy era el momento en que no pasaba nada: el correo de
    // bienvenida solo salía por el formulario de la lista de espera, que era la
    // puerta de antes de abrir. Ocho de diecisiete registrados no lo recibieron
    // nunca. Ver el comentario de cabecera de lib/correoBienvenida.ts.
    //
    // NO PUEDE TUMBAR LA CONFIRMACIÓN. La dirección ya quedó confirmada arriba;
    // si el correo falla, la persona igual entró. Por eso va después del update,
    // sin await sobre la respuesta y con su propio try/catch (sendEmail ya se
    // traga sus errores, pero se envuelve por si eso cambia).
    //
    // NO SE DUPLICA: solo se llega aquí con un token válido, y el update de
    // arriba lo borra en la misma petición. Un segundo clic en el mismo enlace
    // no encuentra usuario y sale por el 400 de antes de llegar hasta acá.
    void (async () => {
      try {
        await sendEmail({
          to: user.email,
          subject: ASUNTO_BIENVENIDA,
          html: htmlBienvenida("registro"),
          text: textoBienvenida("registro"),
          replyTo: CONTACTO_BIENVENIDA,
          headers: {
            "List-Unsubscribe": `<mailto:${CONTACTO_BIENVENIDA}?subject=BAJA>`,
          },
        });
      } catch (e) {
        console.error("[BIENVENIDA FALLIDA] usuario", user.id, e);
      }
    })();

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
