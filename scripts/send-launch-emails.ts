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
 * ⚠️  AVISO: EL REGISTRO DE ENVIADOS NO VIAJA CON EL REPOSITORIO
 * ---------------------------------------------------------------------------
 * Este archivo de registro solo existe en esta máquina. Si ejecutas el script
 * desde otro equipo, se enviará a toda la lista sin historial.
 *
 * Es scripts/.launch-emails-sent.log y está en .gitignore, así que no se sube a
 * git ni está en el servidor: vive únicamente en el portátil desde el que se
 * hicieron las pruebas. Correr el script desde otro computador (o desde una
 * copia recién clonada del repositorio) parte de cero y le escribe otra vez a
 * TODA la lista, incluidos los que ya recibieron el correo. Y un correo enviado
 * no se puede recoger.
 *
 * Si hay que enviarlo desde otro sitio, copia antes ese .log a mano a la carpeta
 * scripts/ de la máquina nueva.
 *
 * ---------------------------------------------------------------------------
 * QUÉ DICE ESTE CORREO (y en qué se diferencia del de bienvenida)
 * ---------------------------------------------------------------------------
 * Son dos correos distintos y tienen que decir cosas distintas:
 *   · lib/correoBienvenida.ts sale al apuntarse a la lista y anuncia que
 *     ABRIMOS el 12 de agosto ("espéranos").
 *   · este sale el 12 de agosto y anuncia que YA ESTAMOS ABIERTOS ("entra
 *     ahora"). Quien se apuntó en julio ya recibió el primero; si este repitiera
 *     el mismo texto parecería un reenvío por error.
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
 *   en vez de escribirles dos veces. Ese log está en .gitignore: lee el aviso de
 *   arriba antes de correr esto desde otra máquina.
 * · Ese log YA TIENE DENTRO las direcciones de las pruebas de julio, y las de esas
 *   pruebas recibieron el correo VIEJO (el de "abrimos el 12 de agosto"). Como
 *   están anotadas, el 12 de agosto se las va a saltar y NO recibirán este correo
 *   nuevo. Si quieres que también les llegue, hay que borrarlas del .log a mano
 *   antes de enviar. Son direcciones tuyas y de gente conocida, así que decide tú.
 * · La tabla Waitlist ya existe (se creó el 30 de julio de 2026 junto con el
 *   formulario de /coming-soon). El script la consulta con SQL crudo y no toca
 *   prisma/schema.prisma. Si algún día no estuviera, avisa con todas las letras
 *   en vez de reventar.
 * · Quien se apunte a la lista a partir del 31 de julio de 2026 recibe al instante
 *   el correo de bienvenida (app/api/waitlist/route.ts). Este envío del 12 es el
 *   SEGUNDO correo que reciben, no el primero.
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

const ASUNTO = "Colbisnes ya está abierto";

/** Retardo entre envíos, en milisegundos, para no saturar la API de Resend. */
const RETARDO_MS = 200;

const RAIZ_SCRIPT = dirname(fileURLToPath(import.meta.url));
const ARCHIVO_ENVIADOS = join(RAIZ_SCRIPT, ".launch-emails-sent.log");

// ---------------------------------------------------------------------------
// Contenido del correo
// ---------------------------------------------------------------------------

/**
 * Plantilla propia, escrita aquí dentro en vez de en lib/. Tres razones:
 *
 *   1. NO SE PUEDE IMPORTAR DESDE lib/, y esto está comprobado, no supuesto.
 *      El script se ejecuta con `node scripts/send-launch-emails.ts`, es decir
 *      como módulo ES y con el borrado de tipos nativo de Node. En ese modo la
 *      única forma de importar un archivo TypeScript vecino es con la extensión
 *      puesta (`../lib/correoLanzamiento.ts`); sin extensión, Node no lo
 *      resuelve. Pero con la extensión puesta, `tsc --noEmit` falla con
 *      TS5097 ("An import path can only end with a '.ts' extension when
 *      'allowImportingTsExtensions' is enabled"). O sea: o funciona el script el
 *      12 de agosto, o pasa el build. Habilitar esa opción en el tsconfig del
 *      proyecto entero, doce días antes de abrir, para mover de sitio una
 *      plantilla, es un mal negocio.
 *   2. Este correo sale una sola vez y no se puede corregir después. Si alguien
 *      retoca una plantilla compartida por un correo transaccional cualquiera, el
 *      envío de lanzamiento no debería cambiar de aspecto sin que nadie se entere.
 *   3. El script se ejecuta suelto desde la terminal, en la mañana del
 *      lanzamiento y con prisa. Cuantas menos dependencias internas tenga que
 *      resolver, menos cosas pueden fallar en el peor momento posible.
 *
 * El precio de esto es que el diseño de marca está en dos sitios: aquí y en
 * lib/correoBienvenida.ts. SI SE CAMBIA EL DISEÑO, HAY QUE TOCAR LOS DOS.
 *
 * OJO CON EL `?v=N` DEL LOGO: el proxy de imágenes de Gmail cachea por URL y de
 * forma GLOBAL, no por destinatario. Si alguna vez se cambia el PNG del logo hay
 * que subir ese número, o a todo el mundo le seguirá llegando la imagen vieja
 * cacheada. Se queda en v=3, que es la versión con el logo correcto.
 *
 * Este aviso vive en el código y no como comentario HTML dentro de la plantilla:
 * los comentarios HTML se envían dentro del correo, y no tiene sentido que una
 * nota interna sobre cachés viaje al buzón de cada destinatario.
 */
function construirHtml(): string {
  const parrafo =
    "margin:0 0 14px;color:#475569;font-size:14.5px;line-height:1.65;";
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Colbisnes ya está abierto</title>
</head>
<body style="margin:0;padding:0;background-color:#EEF3FF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Ya puedes comprar y vender de segunda mano con el dinero en custodia.</div>

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
              <p style="margin:0 0 10px;color:#64748B;font-size:14.5px;line-height:1.5;">Hola,</p>
              <h1 style="margin:0 0 18px;color:#0a1628;font-size:20px;font-weight:800;line-height:1.3;">Colbisnes ya está abierto.</h1>

              <p style="${parrafo}">Desde ahora puedes comprar y vender de segunda mano con el dinero en custodia: el vendedor sabe que el pago ya está asegurado antes de despachar, y al comprador no se le libera la plata hasta que confirme que recibió lo que pidió.</p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF3FF;border:1px solid #C7D9FF;border-radius:14px;margin:4px 0 18px;">
                <tr>
                  <td style="padding:16px;text-align:center;">
                    <span style="display:block;color:#1448A3;font-size:16px;font-weight:800;line-height:1.45;">Si algo sale mal, el dinero nunca se movió.</span>
                  </td>
                </tr>
              </table>

              <p style="${parrafo}">Pagas como quieras: tarjeta, PSE, Nequi, contra-entrega o USDT.</p>

              <p style="${parrafo}">🛡️ En Colbisnes pedimos validación con documento de identidad para evitar fraudes.</p>

              <p style="${parrafo}">🔐 Y puedes ponerle un código anti fraude a tu cuenta: desde ese momento, todos los correos que te mandemos lo llevan escrito. Si te llega uno que dice ser de Colbisnes y no trae tu código, no es nuestro.</p>

              <p style="${parrafo}">Y tampoco le vendemos tu información a ningún call center de las cárceles del país 😬</p>
            </td>
          </tr>

          <tr>
            <td style="padding:8px 32px 36px;text-align:center;">
              <a href="https://colbisnes.com" style="display:inline-block;background:linear-gradient(135deg,#1448A3,#1F6BFF);color:#ffffff;padding:15px 36px;border-radius:16px;text-decoration:none;font-weight:700;font-size:15px;box-shadow:0 8px 24px rgba(31,107,255,0.35);">
                Entra ahora &rarr; colbisnes.com
              </a>
            </td>
          </tr>

          <tr>
            <td style="background:#F4F8FF;padding:20px 32px;text-align:center;border-top:1px solid #E2E8F5;">
              <p style="margin:0;color:#94A3B8;font-size:11.5px;line-height:1.6;">
                Colbisnes &middot; El marketplace colombiano de segunda mano<br/>
                Recibes este correo porque te apuntaste a la lista de espera de Colbisnes.<br/>
                Si ya no te interesa, puedes ignorarlo y no te escribiremos más.
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
const TEXTO_PLANO = `Hola,

COLBISNES YA ESTÁ ABIERTO.

Desde ahora puedes comprar y vender de segunda mano con el dinero en custodia: el vendedor sabe que el pago ya está asegurado antes de despachar, y al comprador no se le libera la plata hasta que confirme que recibió lo que pidió.

Si algo sale mal, el dinero nunca se movió.

Pagas como quieras: tarjeta, PSE, Nequi, contra-entrega o USDT.

🛡️ En Colbisnes pedimos validación con documento de identidad para evitar fraudes.

🔐 Y puedes ponerle un código anti fraude a tu cuenta: desde ese momento, todos los correos que te mandemos lo llevan escrito. Si te llega uno que dice ser de Colbisnes y no trae tu código, no es nuestro.

Y tampoco le vendemos tu información a ningún call center de las cárceles del país 😬

Entra ahora -> https://colbisnes.com

---
Recibes este correo porque te apuntaste a la lista de espera de Colbisnes.
Si ya no te interesa, puedes ignorarlo y no te escribiremos más.`;

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
