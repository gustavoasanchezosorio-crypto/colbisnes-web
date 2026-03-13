import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: EmailOptions) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('⚠️ RESEND_API_KEY no configurada, omitiendo envío de correo');
    return;
  }

  try {
    const { data, error } = await resend.emails.send({
      from: 'notificaciones@colbisnes.com',
      to,
      subject,
      html,
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
