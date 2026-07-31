/**
 * ============================================================================
 * ENVÍO DEL CORREO DE LANZAMIENTO A LA LISTA DE ESPERA
 * ============================================================================
 *
 * Script manual, de un solo uso, para el día del lanzamiento (12 de agosto).
 * NO es un endpoint a propósito: un envío masivo no debe quedar expuesto en la
 * web ni poder dispararse por accidente con una URL.
 *
 * ---------------------------------------------------------------------------
 * CÓMO EJECUTARLO
 * ---------------------------------------------------------------------------
 * Desde la RAÍZ del proyecto (colbisnes-web/), no desde scripts/:
 *
 *   1) Ensayo en seco (no envía nada, solo lista a quién le llegaría):
 *      node scripts/send-launch-emails.ts
 *
 *   2) Prueba real a UNA sola dirección (mándatelo a ti primero, siempre):
 *      node scripts/send-launch-emails.ts --solo=tu-correo@gmail.com --confirmar
 *
 *   3) Envío de verdad a toda la lista:
 *      node scripts/send-launch-emails.ts --confirmar
 *
 * Opciones extra:
 *   --limite=50   Envía solo a los primeros 50 (para soltar la lista por tandas).
 *
 * ¿Por qué `node` y no `npx ts-node`?
 *   Porque ts-node no está instalado en este proyecto (los otros 17 scripts de
 *   scripts/ son .js plano). Este equipo corre Node v22, que desde la 22.18
 *   entiende TypeScript de forma nativa: borra los tipos y ejecuta el archivo
 *   directamente. Así que `node scripts/send-launch-emails.ts` funciona tal cual,
 *   sin instalar nada. Si algún día se instala ts-node o tsx, también sirven:
 *      npx tsx scripts/send-launch-emails.ts
 *
 * ⚠️  Al correrlo verás este aviso de Node:
 *       [MODULE_TYPELESS_PACKAGE_JSON] ... add "type": "module" to package.json
 *     Es cosmético: Node solo avisa de que tuvo que releer el archivo para darse
 *     cuenta de que es un módulo ES. El script funciona igual. NO le hagas caso
 *     al consejo de añadir "type": "module" al package.json: este proyecto es
 *     CommonJS y ese cambio rompería server.js (el servidor de producción) y los
 *     17 scripts .js de esta carpeta. El aviso molesta; el arreglo tumba el sitio.
 *
 * ---------------------------------------------------------------------------
 * ANTES DE CORRERLO, TEN EN CUENTA
 * ---------------------------------------------------------------------------
 * · Lee el .env de la raíz. Ese .env apunta a la base de datos de PRODUCCIÓN,
 *   que es justo lo que queremos aquí (la lista de espera real), pero conviene
 *   saberlo: no hay una copia local separada.
 * · Necesita RESEND_API_KEY y DATABASE_URL en el entorno.
 * · Un correo enviado NO se puede recoger. Por eso el envío real exige
 *   --confirmar de forma explícita; sin esa bandera el script no manda nada.
 * · Lleva un registro en scripts/.launch-emails-sent.log con cada dirección ya
 *   enviada. Si el script se cae a mitad de camino (internet, cuota de Resend,
 *   lo que sea), al volver a correrlo se salta a quienes ya recibieron el correo
 *   en vez de escribirles dos veces. Ese log está en .gitignore.
 * · La tabla Waitlist todavía NO existe en el esquema (al 30 de julio de 2026 no
 *   hay captura de correos en /coming-soon). El script la consulta con SQL crudo,
 *   así que compila y no toca prisma/schema.prisma; empezará a funcionar solo,
 *   sin cambiarle nada, apenas exista la tabla con una columna "email". Si la
 *   corres antes, te lo dice con todas las letras en vez de reventar.
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

/** Remitente. Es el mismo buzón verificado que usa lib/email.ts para el resto
 *  del correo transaccional; cambiarlo a una dirección no verificada en Resend
 *  hace que TODO el envío falle. */
const REMITENTE = "Colbisnes <notificaciones@colbisnes.com>";

/** Buzón público de contacto. Sirve de reply-to y de baja (List-Unsubscribe). */
const CONTACTO = "hola@colbisnes.com";

const ASUNTO = "Colbisnes abre el miércoles 12 de agosto";

/** Retardo entre envíos, en milisegundos, para no saturar la API de Resend. */
const RETARDO_MS = 200;

const RAIZ_SCRIPT = dirname(fileURLToPath(import.meta.url));
const ARCHIVO_ENVIADOS = join(RAIZ_SCRIPT, ".launch-emails-sent.log");

// ---------------------------------------------------------------------------
// Contenido del correo
// ---------------------------------------------------------------------------

/**
 * Plantilla propia, copiada a conciencia de lib/emailTemplate.ts en vez de
 * importarla. Dos razones:
 *   1. Este correo sale una sola vez y no se puede corregir después. Si alguien
 *      retoca la plantilla compartida por un correo transaccional cualquiera, el
 *      envío de lanzamiento no debería cambiar de aspecto sin que nadie se entere.
 *   2. El script se ejecuta suelto desde la terminal, en la mañana del
 *      lanzamiento y con prisa. Cuantas menos dependencias internas tenga que
 *      resolver, menos cosas pueden fallar en el peor momento posible.
 * Si se cambia el diseño de marca, hay que actualizar las dos.
 */
function construirHtml(): string {
  const parrafo =
    "margin:0 0 14px;color:#475569;font-size:14.5px;line-height:1.65;";
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Colbisnes abre el 12 de agosto</title>
</head>
<body style="margin:0;padding:0;background-color:#EEF3FF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Abrimos el miércoles 12 de agosto, 10:20 a.m. Aquí se hacen buenos bisnes.</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#EEF3FF;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FFFFFF;border-radius:24px;overflow:hidden;box-shadow:0 8px 40px rgba(31,107,255,0.12);">

          <tr>
            <td style="background:linear-gradient(135deg,#1448A3,#1F6BFF);padding:26px 32px;text-align:center;">
              <!-- El sufijo ?v=N es obligatorio al cambiar el logo: el proxy de
                   imágenes de Gmail cachea por URL y de forma GLOBAL, no por
                   destinatario. Se saltó a v=3 porque las pruebas del 31 de julio
                   salieron con ?v=2 mientras el servidor todavía servía el PNG
                   viejo (el del claim pegado); Gmail pudo quedarse con ese bajo
                   dicha URL y se lo habría servido a los ~200 del envío masivo. -->
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
                    <span style="display:block;color:#64748B;font-size:12px;margin-bottom:3px;">Abrimos</span>
                    <span style="display:block;color:#1448A3;font-size:16px;font-weight:800;line-height:1.45;">Miércoles 12 de agosto, 10:20 a.m.</span>
                    <span style="display:block;color:#64748B;font-size:12px;margin-top:3px;">hora Colombia</span>
                  </td>
                </tr>
              </table>

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
              <a href="https://colbisnes.com" style="display:inline-block;background:linear-gradient(135deg,#1448A3,#1F6BFF);color:#ffffff;padding:15px 36px;border-radius:16px;text-decoration:none;font-weight:700;font-size:15px;box-shadow:0 8px 24px rgba(31,107,255,0.35);">
                Ir a colbisnes.com
              </a>
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

/** Versión en texto plano. No es un adorno: mejora bastante la entregabilidad
 *  de un envío masivo y es lo que ven los clientes que bloquean HTML. */
const TEXTO_PLANO = `¡BIENVENIDOS!

Ya no más eso de: "Aquí se roban hasta un hueco." Relax, para eso se creó Colbisnes.

No todos hablamos inglés, pero todos los colombianos sabemos hacer bisnes.

ABRIMOS: miércoles 12 de agosto, 10:20 a.m. (hora Colombia)

Aquí puedes vender todo eso que ya no usas. Disfruta de bajas comisiones y pagos rápidos. ¡Chao a los intermediarios careros!

Tu dinero siempre permanece en custodia hasta que confirmes que recibiste tu compra. Después de eso... ¡listo el bisnes!

Nos tomamos la seguridad muy en serio. Por eso, para vender tienes que verificar tu identidad con la cédula. Aquí no hay espacio para perfiles falsos ni para pagos con billetes "con la cara de Diomedes Díaz".

Aquí cabemos todos... pero ojo: todos los de bien.

Gracias por hacer bisnes en Colbisnes.

¿Listos para hacer un bisnes?

Gustavo Osorio
CEO Fundador · Colbisnes Colombia

-> https://colbisnes.com

---
Recibes este correo porque te apuntaste a la lista de espera de Colbisnes.
Para no recibir más, responde a este correo con la palabra BAJA.`;

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

function leerBandera(nombre: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${nombre}=`));
  return arg ? arg.slice(nombre.length + 3) : undefined;
}

/** Validación deliberadamente laxa: solo descarta basura evidente. No es tarea
 *  de este script decidir qué direcciones son "buenas"; de eso se encarga Resend. */
function pareceEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/** Lee el registro de direcciones ya enviadas en corridas anteriores. */
function cargarYaEnviados(): Set<string> {
  if (!existsSync(ARCHIVO_ENVIADOS)) return new Set();
  return new Set(
    readFileSync(ARCHIVO_ENVIADOS, "utf8")
      .split("\n")
      .map((l) => l.split("\t")[0].trim().toLowerCase())
      .filter(Boolean),
  );
}

function registrarEnviado(email: string, id: string): void {
  appendFileSync(ARCHIVO_ENVIADOS, `${email}\t${new Date().toISOString()}\t${id}\n`);
}

/**
 * Trae los correos de la tabla Waitlist con SQL crudo.
 *
 * Va en crudo a propósito: la tabla todavía no está en prisma/schema.prisma, y
 * este script no debe ser quien decida cómo se modela la lista de espera (eso
 * es tarea del formulario de captura en /coming-soon). Con $queryRaw el archivo
 * compila hoy y arranca a funcionar solo el día que la tabla exista.
 */
async function obtenerEmails(prisma: PrismaClient): Promise<string[]> {
  let filas: { email: string | null }[];
  try {
    filas = await prisma.$queryRaw<{ email: string | null }[]>`
      SELECT "email" FROM "Waitlist" ORDER BY "email" ASC
    `;
  } catch (err: unknown) {
    const e = err as { message?: string; meta?: { code?: string; message?: string } };
    const detalle = `${e?.meta?.code ?? ""} ${e?.meta?.message ?? ""} ${e?.message ?? ""}`;

    if (detalle.includes("42P01")) {
      throw new Error(
        'La tabla "Waitlist" no existe todavía en la base de datos.\n' +
          "   Es lo esperado si aún no se ha montado la captura de correos en /coming-soon.\n" +
          "   Hace falta: crear el modelo Waitlist en prisma/schema.prisma, correr la migración\n" +
          "   y publicar el formulario. Después vuelve a correr este script sin cambiarle nada.",
      );
    }
    if (detalle.includes("42703")) {
      throw new Error(
        'La tabla "Waitlist" existe, pero no tiene una columna llamada "email".\n' +
          "   Este script espera esa columna. Ajusta la consulta de obtenerEmails() al nombre real.",
      );
    }
    throw err;
  }

  // Normaliza, descarta vacíos/inválidos y quita duplicados conservando el orden.
  const vistos = new Set<string>();
  const limpios: string[] = [];
  for (const fila of filas) {
    const email = (fila.email ?? "").trim().toLowerCase();
    if (!email || !pareceEmail(email) || vistos.has(email)) continue;
    vistos.add(email);
    limpios.push(email);
  }
  return limpios;
}

// ---------------------------------------------------------------------------
// Programa principal
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const confirmar = process.argv.includes("--confirmar");
  const soloUno = leerBandera("solo")?.trim().toLowerCase();
  const limiteRaw = leerBandera("limite");
  const limite = limiteRaw ? Number.parseInt(limiteRaw, 10) : undefined;

  if (limiteRaw && (!Number.isFinite(limite) || (limite as number) < 1)) {
    console.error(`❌ --limite=${limiteRaw} no es un número válido.`);
    process.exit(1);
  }

  if (!process.env.RESEND_API_KEY) {
    console.error("❌ Falta RESEND_API_KEY en el entorno.");
    console.error("   Ejecuta el script desde la raíz del proyecto para que lea el .env.");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("❌ Falta DATABASE_URL en el entorno.");
    console.error("   Ejecuta el script desde la raíz del proyecto para que lea el .env.");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const resend = new Resend(process.env.RESEND_API_KEY);

  console.log("");
  console.log("═══════════════════════════════════════════════════════");
  console.log("  CORREO DE LANZAMIENTO · COLBISNES");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Asunto:     ${ASUNTO}`);
  console.log(`  Remitente:  ${REMITENTE}`);
  console.log(`  Modo:       ${confirmar ? "🔴 ENVÍO REAL" : "🟡 ensayo en seco (no envía nada)"}`);
  console.log("");

  let destinatarios: string[];
  try {
    destinatarios = await obtenerEmails(prisma);
  } catch (err) {
    console.error(`❌ ${(err as Error).message}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log(`  En la lista de espera: ${destinatarios.length} direcciones`);

  // Filtro de prueba: mandar a una sola dirección para revisar cómo se ve.
  if (soloUno) {
    if (!pareceEmail(soloUno)) {
      console.error(`❌ --solo=${soloUno} no parece una dirección válida.`);
      await prisma.$disconnect();
      process.exit(1);
    }
    destinatarios = [soloUno];
    console.log(`  ⚠️  --solo activo: se ignora la lista y se envía únicamente a ${soloUno}`);
  }

  // Salta a quienes ya recibieron el correo en una corrida anterior.
  const yaEnviados = soloUno ? new Set<string>() : cargarYaEnviados();
  const omitidos = destinatarios.filter((e) => yaEnviados.has(e));
  destinatarios = destinatarios.filter((e) => !yaEnviados.has(e));
  if (omitidos.length > 0) {
    console.log(`  Ya recibieron el correo antes (se omiten): ${omitidos.length}`);
  }

  if (limite && destinatarios.length > limite) {
    console.log(`  ⚠️  --limite=${limite}: de ${destinatarios.length} pendientes solo se procesan ${limite}`);
    destinatarios = destinatarios.slice(0, limite);
  }

  const total = destinatarios.length;
  if (total === 0) {
    console.log("");
    console.log("  No queda nadie a quien escribirle. Nada que hacer.");
    console.log("");
    await prisma.$disconnect();
    return;
  }

  // ------------------------------------------------------------------
  // Ensayo en seco: sin --confirmar no sale un solo correo.
  // ------------------------------------------------------------------
  if (!confirmar) {
    console.log("");
    console.log(`  Se enviaría a estas ${total} direcciones:`);
    console.log("");
    destinatarios.forEach((e, i) => console.log(`    ${String(i + 1).padStart(4)}. ${e}`));
    console.log("");
    console.log("───────────────────────────────────────────────────────");
    console.log("  Esto fue un ENSAYO EN SECO. No se envió ningún correo.");
    console.log("");
    console.log("  Antes de soltar el envío real, mándatelo a ti primero:");
    console.log("     node scripts/send-launch-emails.ts --solo=tu-correo@gmail.com --confirmar");
    console.log("");
    console.log("  Y cuando esté todo revisado:");
    console.log("     node scripts/send-launch-emails.ts --confirmar");
    console.log("───────────────────────────────────────────────────────");
    console.log("");
    await prisma.$disconnect();
    return;
  }

  // ------------------------------------------------------------------
  // Envío real
  // ------------------------------------------------------------------
  const html = construirHtml();
  const exitos: string[] = [];
  const fallos: { email: string; motivo: string }[] = [];

  console.log("");
  console.log(`  Enviando a ${total} destinatarios (${RETARDO_MS} ms entre cada uno)...`);
  console.log("");

  for (let i = 0; i < total; i++) {
    const email = destinatarios[i];
    process.stdout.write(`Enviando a ${i + 1} de ${total}: ${email} → `);

    try {
      // Ojo: resend.emails.send() NO lanza excepción cuando la API rechaza el
      // correo; devuelve { data, error }. Si solo se mirara el catch, un envío
      // fallido se contaría como exitoso.
      const { data, error } = await resend.emails.send({
        from: REMITENTE,
        to: email,
        subject: ASUNTO,
        html,
        text: TEXTO_PLANO,
        replyTo: CONTACTO,
        headers: {
          // Da de baja con un clic en Gmail/Outlook. Sin esto, un envío masivo
          // tiene bastantes más papeletas de acabar en spam.
          "List-Unsubscribe": `<mailto:${CONTACTO}?subject=BAJA>`,
        },
      });

      if (error) {
        console.log(`ERROR (${error.message || error.name || "desconocido"})`);
        fallos.push({ email, motivo: error.message || error.name || "desconocido" });
      } else {
        console.log("OK");
        exitos.push(email);
        registrarEnviado(email, data?.id ?? "sin-id");
      }
    } catch (err) {
      // Fallo de red, timeout, cuota agotada... se anota y se sigue con el resto.
      const motivo = err instanceof Error ? err.message : String(err);
      console.log(`ERROR (${motivo})`);
      fallos.push({ email, motivo });
    }

    if (i < total - 1) await dormir(RETARDO_MS);
  }

  // ------------------------------------------------------------------
  // Resumen
  // ------------------------------------------------------------------
  console.log("");
  console.log("═══════════════════════════════════════════════════════");
  console.log("  RESUMEN");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  ✅ Enviados con éxito: ${exitos.length}`);
  console.log(`  ❌ Fallidos:           ${fallos.length}`);
  console.log(`  📋 Total procesados:   ${total}`);

  if (fallos.length > 0) {
    console.log("");
    console.log("  No les llegó a estas direcciones:");
    for (const f of fallos) console.log(`    · ${f.email} — ${f.motivo}`);
    console.log("");
    console.log("  Los envíos exitosos quedaron anotados en scripts/.launch-emails-sent.log,");
    console.log("  así que puedes volver a correr el script con --confirmar y solo");
    console.log("  reintentará con los que fallaron.");
  }
  console.log("");

  await prisma.$disconnect();

  // Código de salida distinto de 0 si algo falló, por si se encadena con otra cosa.
  if (fallos.length > 0) process.exit(1);
}

main().catch(async (err) => {
  console.error("");
  console.error("❌ El script se detuvo por un error inesperado:");
  console.error(err);
  process.exit(1);
});
