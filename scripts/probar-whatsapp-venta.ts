/**
 * ============================================================================
 * PRUEBA MANUAL: envío de WhatsApp (Twilio) — aviso de "¡Vendiste!"
 * ============================================================================
 *
 * Mismo propósito y mismas reglas que scripts/probar-whatsapp.ts, pero con el
 * texto exacto de lib/notificarVenta.ts (notificarVentaVendedor), el aviso
 * automático que ahora dispara cada vez que se confirma una venta en
 * cualquiera de los 5 caminos de pago (Wompi online, comisión de
 * contraentrega, confirmación manual del admin, caso exento master, USDT).
 *
 * A propósito NO hardcodea ningún número de teléfono: siempre se pasa por
 * argumento (--a=) para no dejar un número de una persona real escrito en el
 * repo, que es público (ver reference-colbisnes-repo-public).
 *
 * A propósito tampoco importa lib/whatsapp.ts: al correr con "node" suelto
 * (no con Next.js) no hay carga automática de .env/.env.local ni el mismo
 * resolvedor de rutas de TypeScript, así que este script es self-contained
 * (mismo patrón que scripts/probar-whatsapp.ts).
 *
 * CÓMO EJECUTARLO — desde la raíz del proyecto (colbisnes-web/)
 *   1) Ensayo en seco (no manda nada, solo muestra qué se enviaría):
 *        node scripts/probar-whatsapp-venta.ts --a=3001234567
 *   2) Envío real:
 *        node scripts/probar-whatsapp-venta.ts --a=3001234567 --confirmar
 */
import { config } from "dotenv";
import twilio from "twilio";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const args = process.argv.slice(2);
const numero = args.find((a) => a.startsWith("--a="))?.split("=")[1];
const confirmar = args.includes("--confirmar");

if (!numero) {
  console.error("Falta --a=<numero>. Ejemplo: node scripts/probar-whatsapp-venta.ts --a=3001234567 --confirmar");
  process.exit(1);
}

// Misma normalización que lib/phone.ts normalizarTelefonoCO, copiada aquí para
// que este script no dependa de imports de la app (ver nota en probar-whatsapp.ts).
function normalizarTelefonoCO(telefono: string): string {
  let limpio = telefono.replace(/[^\d+]/g, "");
  if (limpio.startsWith("+")) return limpio;
  if (limpio.startsWith("57")) return "+" + limpio;
  if (limpio.length === 10) return "+57" + limpio;
  return "+" + limpio;
}

// Mismo texto que lib/notificarVenta.ts, con datos de ejemplo en vez de los
// reales de una orden.
const nombreVendedor = "Vendedor de prueba";
const producto = "Producto de prueba";
const monto = (50000).toLocaleString("es-CO");
const body =
  `🎉 *Colbisnes* - ¡Vendiste!\n\n` +
  `Hola ${nombreVendedor}, vendiste *${producto}*.\n\n` +
  `Recibirás $${monto} COP una vez se complete la entrega. Alista el envío desde la app.`;
const destino = normalizarTelefonoCO(numero);

console.log("--- Vista previa del mensaje ---");
console.log("Para:", destino);
console.log("Texto:\n" + body);
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
  })
  .then((result) => {
    console.log("\n✅ Enviado — sid:", result.sid);
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n❌ Error enviando:", err.message);
    process.exit(1);
  });
