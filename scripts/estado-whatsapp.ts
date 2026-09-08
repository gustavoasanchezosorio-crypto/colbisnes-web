/**
 * Consulta en Twilio el estado real de entrega de un mensaje de WhatsApp por su SID.
 * Solo lectura (GET a la API de Twilio) — no manda nada ni toca la base de datos.
 *
 * Por qué existe: que sendWhatsapp() no lance error y devuelva un SID NO significa
 * que el mensaje haya llegado — Twilio lo acepta en cola de forma síncrona y la
 * entrega real (o el fallo, p.ej. 63015 del Sandbox) se resuelve después.
 *
 * Uso: node scripts/estado-whatsapp.ts <SID>
 */
import { config } from "dotenv";
import twilio from "twilio";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const sid = process.argv[2];
if (!sid) {
  console.error("Falta el SID. Uso: node scripts/estado-whatsapp.ts <SID>");
  process.exit(1);
}

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

client
  .messages(sid)
  .fetch()
  .then((m) => {
    console.log("status:", m.status);
    console.log("errorCode:", m.errorCode);
    console.log("errorMessage:", m.errorMessage);
    console.log("to:", m.to);
    console.log("from:", m.from);
  })
  .catch((e) => console.error("fetch error:", e.message));
