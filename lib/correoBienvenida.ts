// lib/correoBienvenida.ts
//
// Correo que recibe quien deja su dirección en la lista de espera de
// /coming-soon. Se envía en el momento del alta, no el día del lanzamiento.
//
// POR QUÉ EXISTE ESTE ARCHIVO
// ---------------------------------------------------------------------------
// Hasta el 2026-07-31, apuntarse a la lista de espera no mandaba nada: las
// direcciones se acumulaban y el único correo previsto salía el 12 de agosto
// con scripts/send-launch-emails.ts. Eso deja hasta doce días de silencio entre
// que alguien se apunta y recibe la primera señal de vida. A esa distancia
// mucha gente ya no recuerda haberse apuntado, y no borra: marca como spam.
// Como ese envío del 12 es además el primer envío masivo del dominio (que está
// en calentamiento), unas pocas marcas de spam ahí hacen un daño desmedido a la
// entregabilidad justo el día en que más falta hace que los correos lleguen.
//
// POR QUÉ NO SE IMPORTA DE scripts/send-launch-emails.ts
// ---------------------------------------------------------------------------
// Ese script tiene su plantilla duplicada a propósito y lo explica en sus
// comentarios: el correo de lanzamiento sale una sola vez y no se puede
// corregir, así que no debe cambiar de aspecto porque alguien retoque una
// plantilla compartida. Se respeta esa decisión y este archivo es una copia
// independiente. No es deuda accidental: a partir del 12 de agosto los dos
// correos tienen que decir cosas distintas ("abrimos el 12" vs. "ya estamos
// abiertos"), así que van a divergir de todas formas.
//
// SI SE CAMBIA EL DISEÑO DE MARCA hay que actualizar los dos.

/** Buzón público de contacto. Sirve de reply-to y de baja (List-Unsubscribe). */
export const CONTACTO_BIENVENIDA = "hola@colbisnes.com";

export const ASUNTO_BIENVENIDA =
  "Ya puedes entrar a Colbisnes (las compras arrancan el 12)";

/**
 * Enlace del botón: acceso anticipado a la web, saltándose el candado.
 *
 * QUÉ ABRE Y QUÉ NO
 * ---------------------------------------------------------------------------
 * `?acceso=CÓDIGO` deja pasar el candado de prelanzamiento y deja al navegador
 * en modo prueba (lib/modoPrueba.ts). En ese modo se puede navegar, registrarse,
 * PUBLICAR productos, verificar identidad y chatear; lo único bloqueado son las
 * diez rutas que mueven plata. O sea: quien recibe este correo puede montar su
 * tienda desde hoy, y el 12 de agosto a las 10:20 se abren las compras solas,
 * con el inventario ya puesto.
 *
 * Se hace así porque el problema real del lanzamiento no era la demanda sino la
 * oferta: el 2 de agosto había 2 productos publicados. Traer compradores a una
 * tienda vacía gasta la única primera impresión que existe.
 *
 * EL CÓDIGO SE VA A HACER PÚBLICO, Y SE ASUME
 * ---------------------------------------------------------------------------
 * Va en texto plano dentro de cada correo: se reenvía, se pantallazea y en pocos
 * días lo tiene cualquiera. Es una decisión tomada, no un descuido. Lo peor que
 * puede hacer un desconocido con él es entrar a mirar y publicar algo — el
 * dinero sigue bloqueado —, y pasado el 12 el código queda inerte solo, porque
 * `enModoPrueba()` y el candado dependen de `comingSoonActivo()`.
 *
 * SI LA VARIABLE NO ESTÁ, NO SE INVENTA NADA
 * ---------------------------------------------------------------------------
 * Sin `LAUNCH_BYPASS_CODE` el botón cae al sitio a secas. Nunca debe salir un
 * `?acceso=undefined`: además de no funcionar, le enseña a medio mundo que hay
 * un parámetro de acceso que adivinar.
 */
export function urlEntrarAnticipado(): string {
  const codigo = process.env.LAUNCH_BYPASS_CODE;
  if (!codigo) return "https://colbisnes.com";
  return `https://colbisnes.com/?acceso=${encodeURIComponent(codigo)}`;
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
export function htmlBienvenida(urlEntrar: string = urlEntrarAnticipado()): string {
  const parrafo =
    "margin:0 0 14px;color:#475569;font-size:14.5px;line-height:1.65;";
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Ya puedes entrar a Colbisnes</title>
</head>
<body style="margin:0;padding:0;background-color:#EEF3FF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Entra y publica desde ya. Las compras se activan el miércoles 12 de agosto. Aquí se hacen buenos bisnes.</div>

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
                    <span style="display:block;color:#64748B;font-size:12px;margin-bottom:3px;">Ya puedes entrar y publicar</span>
                    <span style="display:block;color:#1448A3;font-size:16px;font-weight:800;line-height:1.45;">Las compras se activan el miércoles 12 de agosto, 10:20 a.m.</span>
                    <span style="display:block;color:#64748B;font-size:12px;margin-top:3px;">hora Colombia</span>
                  </td>
                </tr>
              </table>

              <p style="${parrafo}">Y no tienes que esperar sentado: <strong style="color:#0a1628;">te abrimos la puerta desde ya.</strong> Entra, arma tu perfil y publica lo que quieras vender. Así el 12, cuando se abran las compras, tu bisnes ya está montado y de una empiezan a llegarte clientes.</p>
              <p style="${parrafo}">Eso sí, para que no haya líos: hasta el 12 se puede publicar, mirar y preparar todo, pero todavía no se puede pagar ni cobrar. Tus publicaciones son de verdad y ahí se quedan.</p>

              <p style="${parrafo}">Aquí puedes vender todo eso que ya no usas. Disfruta de bajas comisiones y pagos rápidos. ¡Chao a los intermediarios careros!</p>
              <p style="${parrafo}">Tu dinero siempre permanece en custodia hasta que confirmes que recibiste tu compra. Después de eso&hellip; <strong style="color:#0a1628;">¡listo el bisnes!</strong></p>
              <p style="${parrafo}">Nos tomamos la seguridad muy en serio. Por eso, para vender tienes que verificar tu identidad con la cédula. Aquí no hay espacio para perfiles falsos ni para pagos con billetes &ldquo;con la cara de Diomedes Díaz&rdquo;.</p>
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
                Entrar y publicar ahora
              </a>
              <p style="margin:12px 0 0;color:#94A3B8;font-size:12px;line-height:1.5;">Este enlace es tuyo: te deja entrar antes de que abramos al público.</p>
            </td>
          </tr>

          <tr>
            <td style="background:#F4F8FF;padding:20px 32px;text-align:center;border-top:1px solid #E2E8F5;">
              <p style="margin:0;color:#94A3B8;font-size:11.5px;line-height:1.6;">
                Colbisnes &middot; El marketplace colombiano de segunda mano<br/>
                Recibes este correo porque te apuntaste a la lista de espera.<br/>
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
 *  clientes de correo que bloquean HTML.
 *
 *  Dejó de ser una constante el 2026-08-02: ahora lleva dentro el enlace de
 *  acceso anticipado, que se construye en tiempo de ejecución a partir de
 *  LAUNCH_BYPASS_CODE. */
export function textoBienvenida(urlEntrar: string = urlEntrarAnticipado()): string {
  return `¡BIENVENIDOS!

Ya no más eso de: "Aquí se roban hasta un hueco." Relax, para eso se creó Colbisnes.

No todos hablamos inglés, pero todos los colombianos sabemos hacer bisnes.

YA PUEDES ENTRAR Y PUBLICAR. Las compras se activan el miércoles 12 de agosto, 10:20 a.m. (hora Colombia)

Y no tienes que esperar sentado: te abrimos la puerta desde ya. Entra, arma tu perfil y publica lo que quieras vender. Así el 12, cuando se abran las compras, tu bisnes ya está montado y de una empiezan a llegarte clientes.

Eso sí, para que no haya líos: hasta el 12 se puede publicar, mirar y preparar todo, pero todavía no se puede pagar ni cobrar. Tus publicaciones son de verdad y ahí se quedan.

Aquí puedes vender todo eso que ya no usas. Disfruta de bajas comisiones y pagos rápidos. ¡Chao a los intermediarios careros!

Tu dinero siempre permanece en custodia hasta que confirmes que recibiste tu compra. Después de eso... ¡listo el bisnes!

Nos tomamos la seguridad muy en serio. Por eso, para vender tienes que verificar tu identidad con la cédula. Aquí no hay espacio para perfiles falsos ni para pagos con billetes "con la cara de Diomedes Díaz".

Aquí cabemos todos... pero ojo: todos los de bien.

Gracias por hacer bisnes en Colbisnes.

¿Listos para hacer un bisnes?

Gustavo Osorio
CEO Fundador · Colbisnes Colombia

ENTRAR Y PUBLICAR AHORA -> ${urlEntrar}
(Este enlace es tuyo: te deja entrar antes de que abramos al público.)

---
Recibes este correo porque te apuntaste a la lista de espera de Colbisnes.
Para no recibir más, responde a este correo con la palabra BAJA.`;
}
