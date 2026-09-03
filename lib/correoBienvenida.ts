// lib/correoBienvenida.ts
//
// Correo de bienvenida. Sale por DOS puertas distintas:
//   · al confirmar la dirección tras registrarse (app/api/auth/verify), y
//   · al dejar la dirección en la lista de espera (app/api/waitlist).
//
// POR QUÉ EXISTE ESTE ARCHIVO
// ---------------------------------------------------------------------------
// Hasta el 2026-07-31, apuntarse a la lista de espera no mandaba nada: las
// direcciones se acumulaban y el único correo previsto salía el 12 de agosto
// con scripts/send-launch-emails.ts. Eso deja hasta doce días de silencio entre
// que alguien se apunta y recibe la primera señal de vida. A esa distancia
// mucha gente ya no recuerda haberse apuntado, y no borra: marca como spam.
//
// POR QUÉ AHORA TAMBIÉN SALE AL REGISTRARSE (2026-09-02)
// ---------------------------------------------------------------------------
// Este correo nació atado a la lista de espera, que era LA puerta de entrada
// antes de abrir. Después del 12 de agosto esa puerta la usa casi nadie (1
// persona en tres semanas) y la gente entra por el registro normal — donde el
// único correo que había era el de confirmar la dirección. Resultado: 8 de 17
// usuarios registrados no habían recibido jamás una bienvenida. El correo
// estaba bien; estaba colgado de la puerta equivocada.
//
// Se manda al CONFIRMAR la dirección, no al registrarse, por dos razones: no
// amontonar dos correos en el mismo minuto, y no darle la bienvenida a quien
// nunca terminó de entrar (3 de esos 8 jamás confirmaron).
//
// POR QUÉ NO SE IMPORTA DE scripts/send-launch-emails.ts
// ---------------------------------------------------------------------------
// Ese script tiene su plantilla duplicada a propósito y lo explica en sus
// comentarios: el correo de lanzamiento salió una sola vez y no se puede
// corregir, así que no debe cambiar de aspecto porque alguien retoque una
// plantilla compartida. Ya divergieron, como estaba previsto: aquel anunciaba
// "abrimos el 12" y este dice "ya estamos abiertos".
//
// SI SE CAMBIA EL DISEÑO DE MARCA hay que actualizar los dos.

/** Buzón público de contacto. Sirve de reply-to y de baja (List-Unsubscribe). */
export const CONTACTO_BIENVENIDA = "hola@colbisnes.com";

// El asunto NO puede parecerse al del correo de confirmación de dirección
// (app/api/auth/register), porque llegan con pocos minutos de diferencia al
// mismo buzón y el segundo se lee como un reenvío del primero.
export const ASUNTO_BIENVENIDA = "¡Ya estás adentro! Bienvenido a Colbisnes";

/**
 * De dónde viene la persona. Solo cambia la línea del pie que explica por qué
 * recibe el correo — obligatoria para que Gmail y Outlook no lo traten como
 * correo no solicitado, y tiene que decir la verdad en cada caso.
 */
export type OrigenBienvenida = "registro" | "lista";

const MOTIVO: Record<OrigenBienvenida, string> = {
  registro: "Recibes este correo porque acabas de crear tu cuenta en Colbisnes.",
  lista: "Recibes este correo porque te apuntaste a la lista de espera.",
};

/**
 * Enlace del botón.
 *
 * Antes del 12 de agosto esto devolvía `https://colbisnes.com/?acceso=CÓDIGO`,
 * el enlace de acceso anticipado que se saltaba el candado de prelanzamiento.
 * Ese candado ya no existe: `comingSoonActivo()` es falso, así que el parámetro
 * no abre nada. Se quita porque seguir metiendo LAUNCH_BYPASS_CODE en cada
 * correo es repartir un secreto que no hace falta — y el día que se vuelva a
 * activar el modo prueba, estaría repartido.
 */
export function urlEntrarColbisnes(): string {
  return "https://colbisnes.com";
}

/**
 * OJO CON EL `?v=N` DEL LOGO
 * El proxy de imágenes de Gmail cachea por URL y de forma GLOBAL, no por
 * destinatario. Si alguna vez se cambia el PNG del logo hay que subir el número,
 * o a los destinatarios nuevos les seguirá llegando la imagen vieja cacheada.
 * Se queda en v=3, que es la versión con el logo correcto (la v=2 salió mientras
 * el servidor aún servía el PNG con el claim pegado).
 *
 * Este aviso vive aquí, en el código, y no como comentario HTML dentro de la
 * plantilla: los comentarios HTML se envían dentro del correo, y no tiene
 * sentido que una nota interna sobre cachés viaje al buzón de cada destinatario.
 */
export function htmlBienvenida(
  origen: OrigenBienvenida = "registro",
  urlEntrar: string = urlEntrarColbisnes()
): string {
  const parrafo =
    "margin:0 0 14px;color:#475569;font-size:14.5px;line-height:1.65;";
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Bienvenido a Colbisnes</title>
</head>
<body style="margin:0;padding:0;background-color:#EEF3FF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Tu cuenta ya está lista. Compra y vende con tu dinero en custodia. Aquí se hacen buenos bisnes.</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#EEF3FF;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FFFFFF;border-radius:24px;overflow:hidden;box-shadow:0 8px 40px rgba(31,107,255,0.12);">

          <tr>
            <td style="background:linear-gradient(135deg,#1448A3,#1F6BFF);padding:26px 32px;text-align:center;">
              <img src="https://colbisnes.com/logo-white-email.png?v=3" alt="Colbisnes" width="176" style="display:block;width:176px;height:auto;margin:0 auto;border:0;outline:none;" />
            </td>
          </tr>

          <tr>
            <td style="padding:36px 32px 8px;">
              <h1 style="margin:0 0 16px;color:#0a1628;font-size:20px;font-weight:800;line-height:1.3;">¡Bienvenidos!</h1>

              <p style="${parrafo}">Ya no más eso de: &ldquo;Aquí se roban hasta un hueco.&rdquo; Relax, para eso se creó Colbisnes.</p>
              <p style="${parrafo}">No todos hablamos inglés, pero todos los colombianos sabemos hacer bisnes.</p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF3FF;border:1px solid #C7D9FF;border-radius:14px;margin:0 0 18px;">
                <tr>
                  <td style="padding:14px 16px;text-align:center;">
                    <span style="display:block;color:#64748B;font-size:12px;margin-bottom:3px;">Tu cuenta ya está lista</span>
                    <span style="display:block;color:#1448A3;font-size:16px;font-weight:800;line-height:1.45;">Ya puedes comprar y vender</span>
                    <span style="display:block;color:#64748B;font-size:12px;margin-top:3px;">con tu dinero en custodia</span>
                  </td>
                </tr>
              </table>

              <p style="${parrafo}">Entra, arma tu perfil y publica lo que quieras vender. <strong style="color:#0a1628;">Mirar productos, escribirle a un vendedor y hacer ofertas no te cuesta nada</strong> y no te pedimos nada para empezar.</p>

              <p style="${parrafo}">Aquí puedes vender todo eso que ya no usas. Disfruta de bajas comisiones y pagos rápidos. ¡Chao a los intermediarios careros!</p>
              <p style="${parrafo}">Tu dinero siempre permanece en custodia hasta que confirmes que recibiste tu compra. Después de eso&hellip; <strong style="color:#0a1628;">¡listo el bisnes!</strong></p>
              <p style="${parrafo}">Nos tomamos la seguridad muy en serio. Por eso, cuando vayas a <strong style="color:#0a1628;">publicar algo o a pagar</strong>, te pedimos verificar tu identidad con la cédula: son unos 2 minutos. En Colbisnes necesitamos saber quién compra y quién vende para evitar fraudes. Aquí no hay espacio para perfiles falsos ni para pagos con billetes &ldquo;con la cara de Diomedes Díaz&rdquo;.</p>
              <p style="${parrafo}">Aquí cabemos todos&hellip; pero ojo: todos los de bien.</p>
              <p style="${parrafo}">Gracias por hacer bisnes en Colbisnes.</p>
              <p style="${parrafo}"><strong style="color:#0a1628;">¿Listos para hacer un bisnes?</strong></p>

              <p style="margin:22px 0 0;color:#0a1628;font-size:14.5px;line-height:1.5;">
                <strong>Gustavo Osorio</strong><br/>
                <span style="color:#64748B;font-size:13px;">CEO Fundador &middot; Colbisnes Colombia</span>
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:8px 32px 36px;text-align:center;">
              <a href="${urlEntrar}" style="display:inline-block;background:linear-gradient(135deg,#1448A3,#1F6BFF);color:#ffffff;padding:15px 36px;border-radius:16px;text-decoration:none;font-weight:700;font-size:15px;box-shadow:0 8px 24px rgba(31,107,255,0.35);">
                Entrar a Colbisnes
              </a>
            </td>
          </tr>

          <tr>
            <td style="background:#F4F8FF;padding:20px 32px;text-align:center;border-top:1px solid #E2E8F5;">
              <p style="margin:0;color:#94A3B8;font-size:11.5px;line-height:1.6;">
                Colbisnes &middot; El marketplace colombiano de segunda mano<br/>
                ${MOTIVO[origen]}<br/>
                ¿No quieres saber más? Responde a este correo con la palabra BAJA.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Versión en texto plano. Mejora la entregabilidad y es lo que ven los
 *  clientes de correo que bloquean HTML. */
export function textoBienvenida(
  origen: OrigenBienvenida = "registro",
  urlEntrar: string = urlEntrarColbisnes()
): string {
  return `¡BIENVENIDOS!

Ya no más eso de: "Aquí se roban hasta un hueco." Relax, para eso se creó Colbisnes.

No todos hablamos inglés, pero todos los colombianos sabemos hacer bisnes.

TU CUENTA YA ESTÁ LISTA. Ya puedes comprar y vender, con tu dinero en custodia.

Entra, arma tu perfil y publica lo que quieras vender. Mirar productos, escribirle a un vendedor y hacer ofertas no te cuesta nada y no te pedimos nada para empezar.

Aquí puedes vender todo eso que ya no usas. Disfruta de bajas comisiones y pagos rápidos. ¡Chao a los intermediarios careros!

Tu dinero siempre permanece en custodia hasta que confirmes que recibiste tu compra. Después de eso... ¡listo el bisnes!

Nos tomamos la seguridad muy en serio. Por eso, cuando vayas a publicar algo o a pagar, te pedimos verificar tu identidad con la cédula: son unos 2 minutos. En Colbisnes necesitamos saber quién compra y quién vende para evitar fraudes. Aquí no hay espacio para perfiles falsos ni para pagos con billetes "con la cara de Diomedes Díaz".

Aquí cabemos todos... pero ojo: todos los de bien.

Gracias por hacer bisnes en Colbisnes.

¿Listos para hacer un bisnes?

Gustavo Osorio
CEO Fundador · Colbisnes Colombia

ENTRAR A COLBISNES -> ${urlEntrar}

---
${MOTIVO[origen]}
Para no recibir más, responde a este correo con la palabra BAJA.`;
}
