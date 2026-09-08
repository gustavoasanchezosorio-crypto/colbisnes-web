import twilio from 'twilio';
import { normalizarTelefonoCO } from '@/lib/phone';

const client = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

interface WhatsappOptions {
  to: string;
  body: string;
  /** URL(s) publica(s) de imagen a adjuntar. Twilio las descarga desde esa URL,
   *  por eso tiene que ser una ruta accesible desde internet (no localhost). */
  mediaUrl?: string[];
}

export async function sendWhatsapp({ to, body, mediaUrl }: WhatsappOptions) {
  if (!client) {
    console.warn('⚠️ Twilio no configurado, omitiendo WhatsApp');
    return;
  }
  if (!to) {
    console.warn('⚠️ Usuario sin numero de WhatsApp registrado, omitiendo');
    return;
  }

  try {
    const numeroDestino = normalizarTelefonoCO(to);
    const result = await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM,
      to: 'whatsapp:' + numeroDestino,
      body,
      ...(mediaUrl && mediaUrl.length ? { mediaUrl } : {}),
    });
    console.log('✅ WhatsApp enviado:', result.sid);
    return result;
  } catch (error: any) {
    console.error('❌ Error enviando WhatsApp:', error.message);
  }
}

interface WhatsappTemplateOptions {
  to: string;
  /** SID de la plantilla aprobada por Meta (Twilio Content Template Builder).
   *  Se pasa por variable de entorno — todavia no existen porque la plantilla
   *  no esta creada/aprobada (tarea #5 de la lista de rollout de WhatsApp). */
  contentSid: string;
  /** Valores para los {{1}}, {{2}}... de la plantilla, como los pide la Content API. */
  contentVariables: Record<string, string>;
}

/**
 * Envia un WhatsApp usando una plantilla pre-aprobada por Meta (Content API),
 * en vez de texto libre. Fuera de una ventana de 24h iniciada por el usuario,
 * WhatsApp exige esto — texto libre (sendWhatsapp de arriba) lo rechaza con
 * error 63016. Ver tarea #6 de la lista de rollout de WhatsApp.
 *
 * Todavia NO reemplaza a sendWhatsapp en los 3 sitios que hoy la llaman
 * (app/api/messages/route.ts, app/api/offers/route.ts x2): falta el
 * contentSid real, que solo existe despues de crear y que Meta apruebe la
 * plantilla (tarea #5), que a su vez depende de las tareas #1-4 (cuenta
 * Full, Meta Business, sender de produccion, verificacion de negocio).
 * Cuando eso este listo, cambiar esas 3 llamadas a usar esta funcion.
 */
export async function sendWhatsappTemplate({ to, contentSid, contentVariables }: WhatsappTemplateOptions) {
  if (!client) {
    console.warn('⚠️ Twilio no configurado, omitiendo WhatsApp');
    return;
  }
  if (!to) {
    console.warn('⚠️ Usuario sin numero de WhatsApp registrado, omitiendo');
    return;
  }
  if (!contentSid) {
    console.warn('⚠️ Falta contentSid (plantilla no configurada todavia), omitiendo WhatsApp');
    return;
  }

  try {
    const numeroDestino = normalizarTelefonoCO(to);
    const result = await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM,
      to: 'whatsapp:' + numeroDestino,
      contentSid,
      contentVariables: JSON.stringify(contentVariables),
    });
    console.log('✅ WhatsApp (plantilla) enviado:', result.sid);
    return result;
  } catch (error: any) {
    console.error('❌ Error enviando WhatsApp (plantilla):', error.message);
  }
}
