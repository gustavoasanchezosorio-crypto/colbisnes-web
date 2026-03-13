const { Resend } = require('resend');
require('dotenv').config();

const resend = new Resend(process.env.RESEND_API_KEY);

async function test() {
  try {
    const { data, error } = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: 'gustavoa.sanchezosorio@gmail.com',
      subject: 'Prueba desde script',
      html: '<p>Hola, esto es una prueba desde el script</p>',
    });
    if (error) {
      console.error('❌ Error:', error);
    } else {
      console.log('✅ Éxito:', data);
    }
  } catch (e) {
    console.error('❌ Excepción:', e);
  }
}

test();
