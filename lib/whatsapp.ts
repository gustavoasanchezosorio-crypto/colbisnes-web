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
