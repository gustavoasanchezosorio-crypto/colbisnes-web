/**
 * ============================================================================
 * PRUEBA MANUAL: envío de WhatsApp (Twilio)
 * ============================================================================
 *
 * Para verificar cómo se ve una plantilla de WhatsApp (texto + imagen adjunta)
 * antes de que ese mismo código corra contra usuarios reales — p.ej. el aviso
 * de "nuevo mensaje" de app/api/messages/route.ts.
 *
 * A propósito NO hardcodea ningún número de teléfono: siempre se pasa por
 * argumento (--a=) para no dejar un número de una persona real escrito en el
 * repo, que es público (ver reference-colbisnes-repo-public).
 *
 * A propósito tampoco importa lib/whatsapp.ts: al correr con "node" suelto
 * (no con Next.js) no hay carga automática de .env/.env.local ni el mismo
 * resolvedor de rutas de TypeScript, así que este script es self-contained
 * (mismo patrón que scripts/enviar-reactivacion.ts).
 *
 * CÓMO EJECUTARLO — desde la raíz del proyecto (colbisnes-web/)
 *   1) Ensayo en seco (no manda nada, solo muestra qué se enviaría):
 *        node scripts/probar-whatsapp.ts --a=3001234567
 *   2) Envío real:
 *        node scripts/probar-whatsapp.ts --a=3001234567 --confirmar
 */
import { config } from "dotenv";
import twilio from "twilio";

// Las credenciales de Twilio de este proyecto viven en .env.local (no en .env),
// que dotenv/config no carga por defecto. Se cargan ambos, con .env.local
// pisando a .env si hay valores repetidos — mismo orden que usa Next.js.
config({ path: ".env" });
config({ path: ".env.local", override: true });

const args = process.argv.slice(2);
const numero = args.find((a) => a.startsWith("--a="))?.split("=")[1];
const confirmar = args.includes("--confirmar");

if (!numero) {
  console.error("Falta --a=<numero>. Ejemplo: node scripts/probar-whatsapp.ts --a=3001234567 --confirmar");
  process.exit(1);
}

// Misma normalización que lib/phone.ts normalizarTelefonoCO, copiada aquí para
// que este script no dependa de imports de la app (ver nota arriba).
function normalizarTelefonoCO(telefono: string): string {
  let limpio = telefono.replace(/[^\d+]/g, "");
  if (limpio.startsWith("+")) return limpio;
  if (limpio.startsWith("57")) return "+" + limpio;
  if (limpio.length === 10) return "+57" + limpio;
  return "+" + limpio;
}

// Mismo texto/imagen que app/api/messages/route.ts, con datos de ejemplo en
// vez de los reales de una conversación.
const body = `💬 *Colbisnes*\n\nTienes un nuevo mensaje sobre tu producto *Producto de prueba*, de *Comprador de prueba*.\n\nRespóndele aquí: https://colbisnes.com/mensajes`;
const mediaUrl = ["https://colbisnes.com/logo-og-square.png"];
const destino = normalizarTelefonoCO(numero);

console.log("--- Vista previa del mensaje ---");
console.log("Para:", destino);
console.log("Texto:\n" + body);
console.log("Imagen adjunta:", mediaUrl[0]);
console.log("--------------------------------");

if (!confirmar) {
  console.log("\n(Ensayo en seco: no se envió nada. Agrega --confirmar para mandarlo de verdad.)");
  process.exit(0);
}

if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
  console.error("Faltan TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN en el entorno.");
  process.exit(1);
}

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

client.messages
  .create({
    from: process.env.TWILIO_WHATSAPP_FROM,
    to: "whatsapp:" + destino,
    body,
    mediaUrl,
  })
  .then((result) => {
    console.log("\n✅ Enviado — sid:", result.sid);
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n❌ Error enviando:", err.message);
    process.exit(1);
  });
