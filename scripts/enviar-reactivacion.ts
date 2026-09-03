/**
 * ============================================================================
 * ENVÍO MANUAL: REACTIVACIÓN — "publica tu primer producto"
 * ============================================================================
 *
 * Script manual, de un solo uso (2026-09-03), parte de la Fase 0 de
 * docs/campana-reactivacion.md. NO es un endpoint a propósito: un envío a
 * gente real no debe poder dispararse por accidente con una URL.
 *
 * ---------------------------------------------------------------------------
 * A QUIÉN LE LLEGA
 * ---------------------------------------------------------------------------
 * A los usuarios que se registraron y NUNCA publicaron ni un solo producto
 * (10 personas), excluyendo una cuenta de pruebas propia ("PRUEBAS CEO").
 * La lista está escrita a mano más abajo Y el script vuelve a calcularla
 * contra la base de datos en cada corrida: si no coinciden, aborta sin
 * mandar nada (mismo candado que scripts/enviar-reverificacion.ts).
 *
 * A diferencia de ese script, este NO toca la base de datos — solo manda un
 * correo. No hay orden "correo primero, escritura después" que cuidar aquí
 * porque no hay ninguna escritura.
 *
 * ---------------------------------------------------------------------------
 * CÓMO EJECUTARLO — desde la RAÍZ del proyecto (colbisnes-web/)
 * ---------------------------------------------------------------------------
 *   1) Ensayo en seco (no manda nada, solo lista a quién le tocaría):
 *        node scripts/enviar-reactivacion.ts
 *
 *   2) Prueba real a tu propia dirección (hazla siempre antes):
 *        node scripts/enviar-reactivacion.ts --solo=tu-correo@gmail.com --confirmar
 *      Con --solo NO se consulta la lista de destinatarios: solo se manda el correo.
 *
 *   3) Envío de verdad, a los 10, de inmediato:
 *        node scripts/enviar-reactivacion.ts --confirmar
 *
 * ---------------------------------------------------------------------------
 * PROTECCIONES
 * ---------------------------------------------------------------------------
 * · Sin --confirmar no manda nada.
 * · La lista de destinatarios está escrita a mano aquí abajo, por ID. El
 *   script vuelve a calcular quién cumple el criterio (registrado, cero
 *   productos publicados) y, si el resultado no coincide EXACTAMENTE con la
 *   lista escrita, aborta sin mandar nada. Nunca hay un envío masivo abierto.
 * · Lleva registro en scripts/.reactivacion-sent.log. Si se cae a mitad, al
 *   volver a correrlo se salta a quien ya lo recibió.
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

/** Mismo buzón verificado en Resend que usa lib/email.ts. */
const REMITENTE = "Colbisnes <notificaciones@colbisnes.com>";
const CONTACTO = "hola@colbisnes.com";

const ASUNTO = "Tu catálogo en Colbisnes sigue esperando tu primer producto";

/** Retardo entre envíos para no saturar la API de Resend. */
const RETARDO_MS = 250;

const RAIZ_SCRIPT = dirname(fileURLToPath(import.meta.url));
const ARCHIVO_ENVIADOS = join(RAIZ_SCRIPT, ".reactivacion-sent.log");

/** Cuenta de pruebas propia ("PRUEBAS CEO"). Nunca publicó, pero no es un
 *  destinatario real — se excluye a mano y a propósito, no por accidente. */
const CUENTA_PRUEBA_EXCLUIDA = "cmrfre1jh0003mj0p3avyprf9";

/**
 * DESTINATARIOS — registrados que nunca publicaron nada, sin la cuenta de
 * pruebas. Escritos a mano y verificados contra la base de datos antes de
 * mandar nada.
 *
 * OJO con cmskz7ycq0008rx0peajask29 (ver DESTINATARIOS): en el embudo de
 * mensajes tiene patrón de cuenta de pruebas (se registró minutos antes de
 * escribirle a un vendedor).
 * No se excluye del correo — es una cuenta real registrada y merece la
 * misma invitación — pero si responde publicando, no cuenta como prueba
 * fresca de reactivación orgánica sin más contexto.
 */
const DESTINATARIOS: string[] = [
  "cmrjygugf000dmc0plrsikpt1",
  "cms2b8ltr0003mq0p9v73uegq",
  "cmskz7ycq0008rx0peajask29", // ver nota arriba
  "cmsq9k3s30000s20pzk71c0yv",
  "cmsq9n6bu0001s20pn94agja7",
  "cmsqdh1uw0005ny0poy91x1mo",
  "cmsqogvx1000dny0pngqfm1uk",
  "cmsrrzy7i000gny0p9o2lgt9u",
  "cmtd3q7g50000pe0p0yn9xyui",
  "cmtd4xcdb0001pe0p2c026gwj",
];

// ---------------------------------------------------------------------------
// Plantilla
// ---------------------------------------------------------------------------
//
// Escrita aquí dentro y no importada de lib/, por el mismo motivo documentado
// en scripts/enviar-reverificacion.ts: este script corre como módulo ES con
// el borrado de tipos nativo de Node, y para importar un .ts vecino haría
// falta poner la extensión, lo que rompe `tsc --noEmit` (TS5097).
//
// El enlace del CTA usa ?d=email — el esquema UTM-lite de
// docs/campana-reactivacion.md §6.3, ya verificado seguro contra
// middleware.ts (solo lee el parámetro "acceso").

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

function htmlReactivacion(nombre: string): string {
  const saludo = nombre ? `Hola ${nombre}, tu catálogo sigue esperando` : "Tu catálogo sigue esperando";
  const cuerpo = `
              <h1 style="margin:0 0 16px;color:#0a1628;font-size:20px;font-weight:800;line-height:1.3;">${saludo}</h1>
              <p style="${PARRAFO}">Colbisnes ya está abierta. Publicar no cuesta nada — la comisión la paga quien te compra, tú recibes el 100% de lo que pediste.</p>
              <p style="${PARRAFO}">Ahora mismo tienes dos razones más para publicar hoy:</p>
              <ul style="margin:0 0 14px;padding:0 0 0 18px;color:#475569;font-size:14.5px;line-height:1.65;">
                <li style="margin-bottom:6px;"><strong style="color:#0a1628;">Portada gratis 7 días</strong> en tus primeras publicaciones (quedan 30 cupos, ninguno usado todavía).</li>
                <li><strong style="color:#0a1628;">Comisión más baja en tu próxima venta</strong>, apenas cierres la primera.</li>
              </ul>
              <p style="margin:22px 0 0;color:#0a1628;font-size:14.5px;line-height:1.5;">
                <strong>Gustavo Osorio</strong><br/>
                <span style="color:#64748B;font-size:13px;">CEO Fundador &middot; Colbisnes Colombia</span>
              </p>`;
  return envoltorio(
    ASUNTO,
    cuerpo,
    { texto: "Publicar algo →", url: "https://colbisnes.com/?d=email" },
    "Recibes este correo porque tienes una cuenta en Colbisnes."
  );
}

function textoReactivacion(nombre: string): string {
  const saludo = nombre ? `Hola ${nombre}, tu catálogo sigue esperando` : "Tu catálogo sigue esperando";
  return `${saludo.toUpperCase()}

Colbisnes ya está abierta. Publicar no cuesta nada — la comisión la paga quien te compra, tú recibes el 100% de lo que pediste.

Ahora mismo tienes dos razones más para publicar hoy:
- Portada gratis 7 días en tus primeras publicaciones (quedan 30 cupos, ninguno usado todavía).
- Comisión más baja en tu próxima venta, apenas cierres la primera.

Gustavo Osorio
CEO Fundador · Colbisnes Colombia

PUBLICAR ALGO -> https://colbisnes.com/?d=email

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
  const solo = args.find((a) => a.startsWith("--solo="))?.split("=")[1];

  if (!process.env.RESEND_API_KEY) {
    console.error("✋ Falta RESEND_API_KEY en el entorno. No se hace nada.");
    process.exit(1);
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const prisma = new PrismaClient();

  // -------------------------------------------------------------------------
  // Modo prueba: una sola dirección.
  // -------------------------------------------------------------------------
  if (solo) {
    console.log(`\n🧪 PRUEBA a ${enmascarar(solo)}.`);
    if (!confirmar) {
      console.log("   (ensayo en seco: añade --confirmar para que salga de verdad)");
      await prisma.$disconnect();
      return;
    }
    const { data, error } = await resend.emails.send({
      from: REMITENTE,
      to: solo,
      subject: ASUNTO,
      html: htmlReactivacion("Gustavo"),
      text: textoReactivacion("Gustavo"),
      replyTo: CONTACTO,
      headers: { "List-Unsubscribe": `<mailto:${CONTACTO}?subject=BAJA>` },
    });
    console.log(error ? `   ❌ ${JSON.stringify(error)}` : `   ✅ enviado → ${data?.id}`);
    await prisma.$disconnect();
    return;
  }

  // -------------------------------------------------------------------------
  // Verificación previa: la lista escrita a mano tiene que coincidir con la
  // realidad. Si no coincide, se aborta sin enviar nada.
  // -------------------------------------------------------------------------
  const usuarios = await prisma.user.findMany({
    select: { id: true, email: true, name: true },
  });
  const productos = await prisma.product.findMany({ select: { sellerId: true } });
  const vendedores = new Set(productos.map((p) => p.sellerId));

  const calculado = usuarios
    .filter((u) => !vendedores.has(u.id) && u.id !== CUENTA_PRUEBA_EXCLUIDA)
    .map((u) => u.id)
    .sort();

  const esperado = [...DESTINATARIOS].sort();
  const coincide =
    calculado.length === esperado.length && calculado.every((id, i) => id === esperado[i]);

  if (!coincide) {
    console.error("\n✋ ABORTADO. La lista escrita en el script no coincide con la base de datos.");
    console.error(`   Escritos:   ${esperado.length} → ${esperado.join(", ")}`);
    console.error(`   Calculados: ${calculado.length} → ${calculado.join(", ")}`);
    console.error("   Alguien publicó o se registró desde que se preparó esto. Revisa antes de seguir.");
    await prisma.$disconnect();
    process.exit(1);
  }

  const porId = new Map(usuarios.map((u) => [u.id, u]));
  const enviados = yaEnviados();

  console.log(`\n${confirmar ? "🚀 ENVÍO REAL" : "🔍 ENSAYO EN SECO (no manda nada)"}`);
  console.log(`   Destinatarios: ${DESTINATARIOS.length}\n`);

  let ok = 0;

  for (const id of DESTINATARIOS) {
    const u = porId.get(id);
    if (!u) {
      console.log(`   ⚠️  ${id} ya no existe. Se salta.`);
      continue;
    }
    if (enviados.has(id)) {
      console.log(`   ⏭️  ${enmascarar(u.email)} ya lo recibió antes. Se salta.`);
      continue;
    }
    const primerNombre = primerNombreBonito(u.name);
    console.log(`   → ${enmascarar(u.email)}${primerNombre ? ` (${primerNombre})` : ""}`);

    if (!confirmar) continue;

    const { data, error } = await resend.emails.send({
      from: REMITENTE,
      to: u.email,
      subject: ASUNTO,
      html: htmlReactivacion(primerNombre),
      text: textoReactivacion(primerNombre),
      replyTo: CONTACTO,
      headers: { "List-Unsubscribe": `<mailto:${CONTACTO}?subject=BAJA>` },
    });

    if (error || !data?.id) {
      console.log(`      ❌ correo NO aceptado: ${JSON.stringify(error)}`);
      continue;
    }
    anotarEnviado(id, data.id);
    console.log(`      ✅ correo aceptado (${data.id})`);
    ok++;
    await dormir(RETARDO_MS);
  }

  console.log(`\n📋 Resultado`);
  console.log(`   Correos aceptados: ${ok}/${DESTINATARIOS.length}`);
  if (!confirmar) {
    console.log(`\n(ensayo en seco. Añade --confirmar para que esto ocurra de verdad)`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
