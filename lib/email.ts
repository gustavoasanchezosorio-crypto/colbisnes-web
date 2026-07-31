import { Resend } from 'resend';
import { prisma } from '@/lib/prisma';
import { ANTIPHISHING_MARKER, bannerAntiPhishing } from '@/lib/emailTemplate';

const resend = new Resend(process.env.RESEND_API_KEY);

interface EmailAttachment {
  filename: string;
  content: Buffer;
}

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
  /** Versión en texto plano. No es un adorno: mejora bastante la entregabilidad
   *  y es lo que ven los clientes que bloquean HTML. Sin ella, un correo solo-HTML
   *  puntúa peor en los filtros de spam. */
  text?: string;
  /** Buzón al que contesta el destinatario si le da a "Responder". El remitente
   *  (notificaciones@) es un buzón de salida, no de entrada. */
  replyTo?: string;
  /** Cabeceras extra. Se usa sobre todo para List-Unsubscribe, que Gmail y
   *  Outlook tienen muy en cuenta en correo no transaccional. */
  headers?: Record<string, string>;
}

// Inserta el banner anti-phishing del destinatario en el HTML del correo.
// Si el usuario no tiene código configurado (o no existe), simplemente limpia el
// marcador. Nunca lanza: un fallo aquí no debe impedir el envío del correo.
async function inyectarAntiPhishing(to: string, html: string): Promise<string> {
  try {
    const user = await prisma.user.findUnique({
      where: { email: to },
      select: { antiPhishingCode: true },
    });
    const code = user?.antiPhishingCode?.trim();
    const banner = code ? bannerAntiPhishing(code) : '';

    if (html.includes(ANTIPHISHING_MARKER)) {
      return html.replace(ANTIPHISHING_MARKER, banner);
    }
    // Correos que no usan la plantilla estándar: si hay código, insértalo justo
    // después de la etiqueta <body ...>; si no, deja el HTML igual.
    if (banner) {
      return html.replace(/(<body[^>]*>)/i, `$1${banner}`);
    }
    return html;
  } catch (err) {
    console.error('⚠️ No se pudo inyectar el código anti-phishing:', err);
    // Limpia el marcador para que nunca quede visible en el correo.
    return html.replace(ANTIPHISHING_MARKER, '');
  }
}

export async function sendEmail({
  to,
  subject,
  html,
  attachments,
  text,
  replyTo,
  headers,
}: EmailOptions) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('⚠️ RESEND_API_KEY no configurada, omitiendo envío de correo');
    return;
  }

  try {
    const htmlFinal = await inyectarAntiPhishing(to, html);
    const { data, error } = await resend.emails.send({
      from: 'notificaciones@colbisnes.com',
      to,
      subject,
      html: htmlFinal,
      ...(attachments && attachments.length
        ? { attachments: attachments.map(a => ({ filename: a.filename, content: a.content })) }
        : {}),
      // Los tres van solo si se piden, para no alterar en nada los correos que
      // ya se envían hoy sin ellos.
      ...(text ? { text } : {}),
      ...(replyTo ? { replyTo } : {}),
      ...(headers ? { headers } : {}),
    });

    if (error) {
      console.error('❌ Error enviando correo:', error);
    } else {
      console.log('✅ Correo enviado:', data);
    }
  } catch (error) {
    console.error('❌ Error enviando correo:', error);
  }
}
