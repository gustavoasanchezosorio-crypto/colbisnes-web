/**
 * ============================================================================
 * ENVÍO PROGRAMADO: REVERIFICACIÓN DE IDENTIDAD + BIENVENIDAS ATRASADAS
 * ============================================================================
 *
 * Script manual, de un solo uso (2026-09-02). NO es un endpoint a propósito:
 * un envío a una lista cerrada de personas reales no debe poder dispararse por
 * accidente con una URL.
 *
 * ---------------------------------------------------------------------------
 * QUÉ HACE, Y EN QUÉ ORDEN
 * ---------------------------------------------------------------------------
 * GRUPO A (7 personas) — aprobadas de KYC A MANO y sin cédula guardada.
 *   Son las que un administrador desbloqueó a dedo mientras Didit fallaba: su
 *   cuenta dice "verificada" pero no existe ningún documento detrás. Se les
 *   programa un correo pidiendo completar la verificación y, SOLO SI el correo
 *   quedó aceptado por Resend, se les devuelve el kycStatus a "none".
 *
 *   OJO CON EL ORDEN: primero el correo, después el cambio en la base de datos.
 *   Si fuera al revés y el correo fallara, la persona se quedaría sin el visto
 *   y sin ninguna explicación. Al revés el peor caso es un correo pidiendo
 *   verificarse a alguien que sigue verificado: molesto, pero inofensivo.
 *
 *   NO se tocan los 2 usuarios que Didit sí verificó de verdad y a los que solo
 *   se nos perdió la foto de la cédula. Esos no tienen que repetir nada.
 *
 * GRUPO B (2 personas) — registradas y sin haber recibido jamás una bienvenida.
 *   El correo de bienvenida estuvo hasta hoy colgado del formulario de la lista
 *   de espera, así que quien entró por el registro normal nunca lo recibió (8 de
 *   17). Seis de esos ocho están también en el grupo A y reciben el correo de
 *   identidad, que es el importante; mandarles los dos el mismo minuto sería
 *   ruido. Aquí van solo los 2 que no están en A.
 *
 * ---------------------------------------------------------------------------
 * ⚠️  ESTO NO SE PUEDE DEPLOYAR DESPUÉS
 * ---------------------------------------------------------------------------
 * El correo del grupo A promete que se puede "seguir entrando, mirar productos,
 * escribirle a los vendedores y hacer ofertas con normalidad". Eso SOLO es
 * cierto con el cambio del 2026-09-02 desplegado, que mueve el candado del KYC
 * a publicar y pagar. Con el código anterior, ofertar y escribir también exigían
 * identidad verificada: quitarles el visto antes de desplegar los dejaría fuera
 * de todo y el correo estaría mintiendo.
 *
 *   DESPLIEGA PRIMERO. LUEGO CORRE ESTO.
 *
 * ---------------------------------------------------------------------------
 * CÓMO EJECUTARLO — desde la RAÍZ del proyecto (colbisnes-web/)
 * ---------------------------------------------------------------------------
 *   1) Ensayo en seco (no manda nada, no toca nada, solo lista):
 *        node scripts/enviar-reverificacion.ts
 *
 *   2) Prueba real a tu propia dirección (hazla siempre antes):
 *        node scripts/enviar-reverificacion.ts --solo=tu-correo@gmail.com --confirmar
 *      Con --solo NO se toca la base de datos: solo se manda el correo.
 *
 *   3) Envío de verdad, programado para las 9:00 a.m. hora Colombia:
 *        node scripts/enviar-reverificacion.ts --confirmar
 *
 *   4) Si prefieres que salga YA en vez de a las 9:
 *        node scripts/enviar-reverificacion.ts --confirmar --ahora
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ EL ENVÍO PROGRAMADO LO GUARDA RESEND Y NO UN CRON NUESTRO
 * ---------------------------------------------------------------------------
 * `scheduledAt` es un parámetro de la propia API de Resend: el correo queda
 * retenido en su servidor y sale a la hora indicada. No hace falta que este
 * portátil, ni el servidor de Colbisnes, estén despiertos a las 9. Un cron
 * propio para 9 correos de un solo uso añadiría una pieza que puede fallar.
 *
 * ---------------------------------------------------------------------------
 * PROTECCIONES
 * ---------------------------------------------------------------------------
 * · Sin --confirmar no manda ni escribe nada.
 * · Las listas de destinatarios están escritas a mano aquí abajo, por ID. El
 *   script vuelve a calcular quién cumple los criterios y, si el resultado no
 *   coincide EXACTAMENTE con la lista escrita, aborta sin hacer nada. Nunca hay
 *   un updateMany abierto.
 * · Lleva registro en scripts/.reverificacion-sent.log. Si se cae a mitad, al
 *   volver a correrlo se salta a quien ya recibió el correo.
 * · Un correo enviado no se puede recoger.
 * ============================================================================
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Resend } from "resend";
import { appendFileSync, existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

/** Mismo buzón verificado en Resend que usa lib/email.ts. Cambiarlo por una
 *  dirección no verificada hace que TODO el envío falle. */
const REMITENTE = "Colbisnes <notificaciones@colbisnes.com>";
const CONTACTO = "hola@colbisnes.com";

const ASUNTO_IDENTIDAD = "Completa tu verificación de identidad";
const ASUNTO_BIENVENIDA = "¡Ya estás adentro! Bienvenido a Colbisnes";

/** 9:00 a.m. hora Colombia (UTC-5) del 3 de septiembre de 2026. */
const HORA_ENVIO_ISO = "2026-09-03T14:00:00.000Z";

/** Retardo entre envíos para no saturar la API de Resend. */
const RETARDO_MS = 250;

const RAIZ_SCRIPT = dirname(fileURLToPath(import.meta.url));
const ARCHIVO_ENVIADOS = join(RAIZ_SCRIPT, ".reverificacion-sent.log");

/**
 * GRUPO A — aprobados a mano, sin cédula guardada. Reciben el correo de
 * identidad y pierden el visto.
 * Escritos a mano y verificados contra la base de datos antes de tocar nada.
 */
const GRUPO_A: string[] = [
  "cmrjygugf000dmc0plrsikpt1",
  "cms2b8ltr0003mq0p9v73uegq",
  "cmsq9k3s30000s20pzk71c0yv",
  "cmsq9n6bu0001s20pn94agja7",
  "cmtd3q7g50000pe0p0yn9xyui",
  "cmtd4xcdb0001pe0p2c026gwj",
  "cmtkti2yz0004pe0phs4ic893",
];

/**
 * GRUPO B — nunca recibieron bienvenida y NO están en el grupo A.
 * Solo reciben la bienvenida; no se les toca la cuenta.
 */
const GRUPO_B: string[] = [
  "cmsqdh1uw0005ny0poy91x1mo",
  "cmsrue32y000iny0p86sa9nkg",
];

// ---------------------------------------------------------------------------
// Plantillas
// ---------------------------------------------------------------------------
//
// Escritas aquí dentro y no importadas de lib/, por el mismo motivo documentado
// en scripts/send-launch-emails.ts: este script corre como módulo ES con el
// borrado de tipos nativo de Node, y para importar un .ts vecino haría falta
// poner la extensión, lo que rompe `tsc --noEmit` (TS5097). O funciona el
// script, o pasa el build.
//
// OJO CON EL `?v=N` DEL LOGO: el proxy de imágenes de Gmail cachea por URL de
// forma GLOBAL, no por destinatario. Si se cambia el PNG hay que subir el
// número. v=3 es la versión con el logo correcto.

const PARRAFO =
  "margin:0 0 14px;color:#475569;font-size:14.5px;line-height:1.65;";

function envoltorio(titulo: string, cuerpo: string, cta: { texto: string; url: string }, pie: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${titulo}</title>
</head>
<body style="margin:0;padding:0;background-color:#EEF3FF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
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
              ${cuerpo}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 36px;text-align:center;">
              <a href="${cta.url}" style="display:inline-block;background:linear-gradient(135deg,#1448A3,#1F6BFF);color:#ffffff;padding:15px 36px;border-radius:16px;text-decoration:none;font-weight:700;font-size:15px;box-shadow:0 8px 24px rgba(31,107,255,0.35);">
                ${cta.texto}
              </a>
            </td>
          </tr>
          <tr>
            <td style="background:#F4F8FF;padding:20px 32px;text-align:center;border-top:1px solid #E2E8F5;">
              <p style="margin:0;color:#94A3B8;font-size:11.5px;line-height:1.6;">
                Colbisnes &middot; El marketplace colombiano de segunda mano<br/>
                ${pie}<br/>
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

function htmlIdentidad(nombre: string): string {
  const saludo = nombre ? `Hola ${nombre}, te falta un paso` : "Te falta un paso";
  const cuerpo = `
              <h1 style="margin:0 0 16px;color:#0a1628;font-size:20px;font-weight:800;line-height:1.3;">${saludo}</h1>
              <p style="${PARRAFO}">Estamos reforzando la verificación de identidad en Colbisnes y tu cuenta quedó pendiente de completarla.</p>
              <p style="${PARRAFO}">Es rápido: unos 2 minutos con tu cédula y una selfie.</p>
              <p style="${PARRAFO}">Mientras tanto puedes seguir entrando, mirar productos, escribirle a los vendedores y hacer ofertas con normalidad. Solo para publicar algo o para pagar te vamos a pedir la verificación. En Colbisnes necesitamos saber quién compra y quién vende para evitar fraudes.</p>
              <p style="margin:22px 0 0;color:#0a1628;font-size:14.5px;line-height:1.5;">
                <strong>Gustavo Osorio</strong><br/>
                <span style="color:#64748B;font-size:13px;">CEO Fundador &middot; Colbisnes Colombia</span>
              </p>`;
  return envoltorio(
    "Completa tu verificación de identidad",
    cuerpo,
    { texto: "Verificar mi identidad →", url: "https://colbisnes.com/kyc" },
    "Recibes este correo porque tienes una cuenta en Colbisnes."
  );
}

function textoIdentidad(nombre: string): string {
  const saludo = nombre ? `Hola ${nombre}, te falta un paso` : "Te falta un paso";
  return `${saludo.toUpperCase()}

Estamos reforzando la verificación de identidad en Colbisnes y tu cuenta quedó pendiente de completarla.

Es rápido: unos 2 minutos con tu cédula y una selfie.

Mientras tanto puedes seguir entrando, mirar productos, escribirle a los vendedores y hacer ofertas con normalidad. Solo para publicar algo o para pagar te vamos a pedir la verificación. En Colbisnes necesitamos saber quién compra y quién vende para evitar fraudes.

Gustavo Osorio
CEO Fundador · Colbisnes Colombia

VERIFICAR MI IDENTIDAD -> https://colbisnes.com/kyc

---
Recibes este correo porque tienes una cuenta en Colbisnes.
Para no recibir más, responde a este correo con la palabra BAJA.`;
}

/** Copia de lib/correoBienvenida.ts (ver nota sobre por qué no se importa). */
function htmlBienvenidaScript(): string {
  const cuerpo = `
              <h1 style="margin:0 0 16px;color:#0a1628;font-size:20px;font-weight:800;line-height:1.3;">¡Bienvenidos!</h1>
              <p style="${PARRAFO}">Ya no más eso de: &ldquo;Aquí se roban hasta un hueco.&rdquo; Relax, para eso se creó Colbisnes.</p>
              <p style="${PARRAFO}">No todos hablamos inglés, pero todos los colombianos sabemos hacer bisnes.</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF3FF;border:1px solid #C7D9FF;border-radius:14px;margin:0 0 18px;">
                <tr>
                  <td style="padding:14px 16px;text-align:center;">
                    <span style="display:block;color:#64748B;font-size:12px;margin-bottom:3px;">Tu cuenta ya está lista</span>
                    <span style="display:block;color:#1448A3;font-size:16px;font-weight:800;line-height:1.45;">Ya puedes comprar y vender</span>
                    <span style="display:block;color:#64748B;font-size:12px;margin-top:3px;">con tu dinero en custodia</span>
                  </td>
                </tr>
              </table>
              <p style="${PARRAFO}">Entra, arma tu perfil y publica lo que quieras vender. <strong style="color:#0a1628;">Mirar productos, escribirle a un vendedor y hacer ofertas no te cuesta nada</strong> y no te pedimos nada para empezar.</p>
              <p style="${PARRAFO}">Aquí puedes vender todo eso que ya no usas. Disfruta de bajas comisiones y pagos rápidos. ¡Chao a los intermediarios careros!</p>
              <p style="${PARRAFO}">Tu dinero siempre permanece en custodia hasta que confirmes que recibiste tu compra. Después de eso&hellip; <strong style="color:#0a1628;">¡listo el bisnes!</strong></p>
              <p style="${PARRAFO}">Nos tomamos la seguridad muy en serio. Por eso, cuando vayas a <strong style="color:#0a1628;">publicar algo o a pagar</strong>, te pedimos verificar tu identidad con la cédula: son unos 2 minutos. En Colbisnes necesitamos saber quién compra y quién vende para evitar fraudes.</p>
              <p style="${PARRAFO}">Aquí cabemos todos&hellip; pero ojo: todos los de bien.</p>
              <p style="${PARRAFO}">Gracias por hacer bisnes en Colbisnes.</p>
              <p style="margin:22px 0 0;color:#0a1628;font-size:14.5px;line-height:1.5;">
                <strong>Gustavo Osorio</strong><br/>
                <span style="color:#64748B;font-size:13px;">CEO Fundador &middot; Colbisnes Colombia</span>
              </p>`;
  return envoltorio(
    "Bienvenido a Colbisnes",
    cuerpo,
    { texto: "Entrar a Colbisnes", url: "https://colbisnes.com" },
    "Recibes este correo porque tienes una cuenta en Colbisnes."
  );
}

function textoBienvenidaScript(): string {
  return `¡BIENVENIDOS!

Ya no más eso de: "Aquí se roban hasta un hueco." Relax, para eso se creó Colbisnes.

No todos hablamos inglés, pero todos los colombianos sabemos hacer bisnes.

TU CUENTA YA ESTÁ LISTA. Ya puedes comprar y vender, con tu dinero en custodia.

Entra, arma tu perfil y publica lo que quieras vender. Mirar productos, escribirle a un vendedor y hacer ofertas no te cuesta nada y no te pedimos nada para empezar.

Aquí puedes vender todo eso que ya no usas. Disfruta de bajas comisiones y pagos rápidos. ¡Chao a los intermediarios careros!

Tu dinero siempre permanece en custodia hasta que confirmes que recibiste tu compra. Después de eso... ¡listo el bisnes!

Nos tomamos la seguridad muy en serio. Por eso, cuando vayas a publicar algo o a pagar, te pedimos verificar tu identidad con la cédula: son unos 2 minutos. En Colbisnes necesitamos saber quién compra y quién vende para evitar fraudes.

Aquí cabemos todos... pero ojo: todos los de bien.

Gracias por hacer bisnes en Colbisnes.

Gustavo Osorio
CEO Fundador · Colbisnes Colombia

ENTRAR A COLBISNES -> https://colbisnes.com

---
Recibes este correo porque tienes una cuenta en Colbisnes.
Para no recibir más, responde a este correo con la palabra BAJA.`;
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const enmascarar = (e: string) => (e || "").replace(/^(.{2})[^@]*@/, "$1***@");
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Primer nombre, presentable. Hay gente registrada con el nombre en mayúsculas
 *  ("ESNEIDER"): un "Hola ESNEIDER" se lee como si le estuvieran gritando. */
function primerNombreBonito(nombre: string | null): string {
  const n = (nombre || "").trim().split(/\s+/)[0] || "";
  if (!n) return "";
  return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
}

/** ¿Tenemos guardada la foto de la cédula? kycDocumentId guarda dos cosas
 *  distintas: una sesión suelta de Didit (las fotos viven allá) o un JSON con
 *  las URLs de Cloudinary (subida manual). Solo el JSON cuenta como documento
 *  nuestro. */
function tieneCedulaGuardada(docId: string | null): boolean {
  if (!docId) return false;
  const s = String(docId).trim();
  if (!s.startsWith("{")) return false;
  try {
    const j = JSON.parse(s);
    return !!(j.cedulaUrl && String(j.cedulaUrl).trim().length > 0);
  } catch {
    return false;
  }
}

function yaEnviados(): Set<string> {
  if (!existsSync(ARCHIVO_ENVIADOS)) return new Set();
  return new Set(
    readFileSync(ARCHIVO_ENVIADOS, "utf8")
      .split("\n")
      .map((l) => l.split("\t")[0]?.trim())
      .filter(Boolean) as string[]
  );
}

function anotarEnviado(clave: string, resendId: string) {
  appendFileSync(ARCHIVO_ENVIADOS, `${clave}\t${resendId}\t${new Date().toISOString()}\n`);
}

// ---------------------------------------------------------------------------
// Principal
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const confirmar = args.includes("--confirmar");
  const ahora = args.includes("--ahora");
  const solo = args.find((a) => a.startsWith("--solo="))?.split("=")[1];

  if (!process.env.RESEND_API_KEY) {
    console.error("✋ Falta RESEND_API_KEY en el entorno. No se hace nada.");
    process.exit(1);
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const prisma = new PrismaClient();

  const scheduledAt = ahora ? undefined : HORA_ENVIO_ISO;
  if (scheduledAt && new Date(scheduledAt).getTime() <= Date.now()) {
    console.error(`✋ La hora programada (${scheduledAt}) ya pasó. Ajusta HORA_ENVIO_ISO o usa --ahora.`);
    await prisma.$disconnect();
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // Modo prueba: una sola dirección, sin tocar la base de datos.
  // -------------------------------------------------------------------------
  if (solo) {
    console.log(`\n🧪 PRUEBA a ${enmascarar(solo)} — no se toca la base de datos.`);
    if (!confirmar) {
      console.log("   (ensayo en seco: añade --confirmar para que salga de verdad)");
      await prisma.$disconnect();
      return;
    }
    for (const [asunto, html, texto] of [
      [ASUNTO_IDENTIDAD, htmlIdentidad("Gustavo"), textoIdentidad("Gustavo")],
      [ASUNTO_BIENVENIDA, htmlBienvenidaScript(), textoBienvenidaScript()],
    ] as [string, string, string][]) {
      const { data, error } = await resend.emails.send({
        from: REMITENTE,
        to: solo,
        subject: asunto,
        html,
        text: texto,
        replyTo: CONTACTO,
        headers: { "List-Unsubscribe": `<mailto:${CONTACTO}?subject=BAJA>` },
        ...(scheduledAt ? { scheduledAt } : {}),
      });
      console.log(error ? `   ❌ ${asunto}: ${JSON.stringify(error)}` : `   ✅ ${asunto} → ${data?.id}`);
      await dormir(RETARDO_MS);
    }
    await prisma.$disconnect();
    return;
  }

  // -------------------------------------------------------------------------
  // Verificación previa: la lista escrita a mano tiene que coincidir con la
  // realidad. Si no coincide, se aborta sin escribir ni enviar nada.
  // -------------------------------------------------------------------------
  const usuarios = await prisma.user.findMany({
    select: { id: true, email: true, name: true, kycStatus: true, kycDocumentId: true, docNumber: true },
  });
  const auditoria = await prisma.auditLog.findMany({
    where: { action: "APROBAR_KYC" },
    select: { entityId: true },
  });
  const aprobadosAMano = new Set(auditoria.map((a) => a.entityId).filter(Boolean) as string[]);

  const calculadoA = usuarios
    .filter(
      (u) =>
        u.kycStatus === "approved" &&
        aprobadosAMano.has(u.id) &&
        !tieneCedulaGuardada(u.kycDocumentId) &&
        !u.docNumber
    )
    .map((u) => u.id)
    .sort();

  const esperadoA = [...GRUPO_A].sort();
  const coincide =
    calculadoA.length === esperadoA.length && calculadoA.every((id, i) => id === esperadoA[i]);

  if (!coincide) {
    console.error("\n✋ ABORTADO. La lista escrita en el script no coincide con la base de datos.");
    console.error(`   Escritos:  ${esperadoA.length} → ${esperadoA.join(", ")}`);
    console.error(`   Calculados:${calculadoA.length} → ${calculadoA.join(", ")}`);
    console.error("   Alguien cambió de estado desde que se preparó esto. Revisa antes de seguir.");
    await prisma.$disconnect();
    process.exit(1);
  }

  const porId = new Map(usuarios.map((u) => [u.id, u]));
  const enviados = yaEnviados();

  console.log(`\n${confirmar ? "🚀 ENVÍO REAL" : "🔍 ENSAYO EN SECO (no manda ni escribe nada)"}`);
  console.log(`   Programado para: ${scheduledAt ?? "de inmediato"}`);
  console.log(`   Grupo A (identidad + quitar visto): ${GRUPO_A.length}`);
  console.log(`   Grupo B (bienvenida atrasada):      ${GRUPO_B.length}\n`);

  let okA = 0;
  let okB = 0;

  // --- GRUPO A -------------------------------------------------------------
  for (const id of GRUPO_A) {
    const u = porId.get(id);
    if (!u) {
      console.log(`   ⚠️  ${id} ya no existe. Se salta.`);
      continue;
    }
    const clave = `A:${id}`;
    if (enviados.has(clave)) {
      console.log(`   ⏭️  ${enmascarar(u.email)} ya lo recibió antes. Se salta.`);
      continue;
    }
    const primerNombre = primerNombreBonito(u.name);
    console.log(`   → identidad a ${enmascarar(u.email)}${primerNombre ? ` (${primerNombre})` : ""}`);

    if (!confirmar) continue;

    const { data, error } = await resend.emails.send({
      from: REMITENTE,
      to: u.email,
      subject: ASUNTO_IDENTIDAD,
      html: htmlIdentidad(primerNombre),
      text: textoIdentidad(primerNombre),
      replyTo: CONTACTO,
      headers: { "List-Unsubscribe": `<mailto:${CONTACTO}?subject=BAJA>` },
      ...(scheduledAt ? { scheduledAt } : {}),
    });

    if (error || !data?.id) {
      console.log(`      ❌ correo NO aceptado: ${JSON.stringify(error)} — NO se le quita el visto.`);
      continue;
    }
    anotarEnviado(clave, data.id);
    console.log(`      ✅ correo aceptado (${data.id})`);

    // Solo ahora, y uno por uno con el id exacto. Nunca un updateMany abierto.
    await prisma.user.update({ where: { id }, data: { kycStatus: "none" } });
    console.log(`      ✅ kycStatus → "none"`);
    okA++;
    await dormir(RETARDO_MS);
  }

  // --- GRUPO B -------------------------------------------------------------
  for (const id of GRUPO_B) {
    const u = porId.get(id);
    if (!u) {
      console.log(`   ⚠️  ${id} ya no existe. Se salta.`);
      continue;
    }
    const clave = `B:${id}`;
    if (enviados.has(clave)) {
      console.log(`   ⏭️  ${enmascarar(u.email)} ya lo recibió antes. Se salta.`);
      continue;
    }
    console.log(`   → bienvenida a ${enmascarar(u.email)}`);
    if (!confirmar) continue;

    const { data, error } = await resend.emails.send({
      from: REMITENTE,
      to: u.email,
      subject: ASUNTO_BIENVENIDA,
      html: htmlBienvenidaScript(),
      text: textoBienvenidaScript(),
      replyTo: CONTACTO,
      headers: { "List-Unsubscribe": `<mailto:${CONTACTO}?subject=BAJA>` },
      ...(scheduledAt ? { scheduledAt } : {}),
    });

    if (error || !data?.id) {
      console.log(`      ❌ correo NO aceptado: ${JSON.stringify(error)}`);
      continue;
    }
    anotarEnviado(clave, data.id);
    console.log(`      ✅ correo aceptado (${data.id})`);
    okB++;
    await dormir(RETARDO_MS);
  }

  // --- Comprobación posterior ---------------------------------------------
  if (confirmar) {
    const despues = await prisma.user.findMany({
      where: { id: { in: GRUPO_A } },
      select: { id: true, kycStatus: true },
    });
    const siguenAprobados = despues.filter((u) => u.kycStatus === "approved").length;
    console.log(`\n📋 Resultado`);
    console.log(`   Correos de identidad aceptados:  ${okA}/${GRUPO_A.length}`);
    console.log(`   Bienvenidas aceptadas:           ${okB}/${GRUPO_B.length}`);
    console.log(`   Del grupo A siguen "approved":   ${siguenAprobados} (debería ser 0)`);
  } else {
    console.log(`\n(ensayo en seco. Añade --confirmar para que esto ocurra de verdad)`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
