// Marcador que colbisnesEmailTemplate deja en el HTML para que sendEmail inserte
// (o elimine) el banner anti-phishing según el destinatario.
export const ANTIPHISHING_MARKER = "<!--COLBISNES_ANTIPHISHING-->";

// Construye la fila del banner anti-phishing (estilo tabla, seguro para email).
// El código ya viene validado a [A-Z0-9], pero se escapa por defensa en profundidad.
export function bannerAntiPhishing(code: string): string {
  const safe = String(code).replace(/[<>&"]/g, "");
  return `
          <tr>
            <td style="padding:16px 32px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF3FF;border:1px solid #C7D9FF;border-radius:14px;">
                <tr>
                  <td style="padding:12px 16px;text-align:center;">
                    <span style="display:block;color:#64748B;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3px;">Tu código anti-phishing</span>
                    <span style="display:block;color:#1448A3;font-size:19px;font-weight:800;letter-spacing:0.1em;">${safe}</span>
                    <span style="display:block;color:#94A3B8;font-size:10.5px;line-height:1.45;margin-top:5px;">Si un correo dice ser de Colbisnes y no muestra este código, descon&iacute;a: podr&iacute;a ser phishing.</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
}

interface ColbisnesEmailOptions {
  preheader?: string;
  titulo: string;
  cuerpo: string;
  ctaTexto?: string;
  ctaUrl?: string;
  colorAcento?: string;
}

export function colbisnesEmailTemplate({
  preheader = "",
  titulo,
  cuerpo,
  ctaTexto,
  ctaUrl,
  colorAcento = "#1F6BFF",
}: ColbisnesEmailOptions): string {
  const baseUrl = process.env.NEXT_PUBLIC_URL || "https://colbisnes-web.vercel.app";
  return `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Colbisnes</title>
</head>
<body style="margin:0;padding:0;background-color:#EEF3FF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#EEF3FF;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FFFFFF;border-radius:24px;overflow:hidden;box-shadow:0 8px 40px rgba(31,107,255,0.12);">

          <tr>
            <td style="background:linear-gradient(135deg,#1448A3,#1F6BFF);padding:26px 32px;text-align:center;">
              <img src="${baseUrl}/logo-white-email.png" alt="Colbisnes" width="176" style="display:block;width:176px;height:auto;margin:0 auto;border:0;outline:none;" />
            </td>
          </tr>

          <!--COLBISNES_ANTIPHISHING-->

          <tr>
            <td style="padding:36px 32px 8px;">
              <h1 style="margin:0 0 16px;color:#0a1628;font-size:20px;font-weight:800;line-height:1.3;">${titulo}</h1>
              <div style="color:#475569;font-size:14.5px;line-height:1.65;">${cuerpo}</div>
            </td>
          </tr>

          ${ctaTexto && ctaUrl ? `
          <tr>
            <td style="padding:8px 32px 36px;text-align:center;">
              <a href="${ctaUrl}" style="display:inline-block;background:linear-gradient(135deg,#1448A3,${colorAcento});color:#ffffff;padding:15px 36px;border-radius:16px;text-decoration:none;font-weight:700;font-size:15px;box-shadow:0 8px 24px rgba(31,107,255,0.35);">
                ${ctaTexto}
              </a>
            </td>
          </tr>` : `<tr><td style="padding-bottom:24px;"></td></tr>`}

          <tr>
            <td style="background:#F4F8FF;padding:20px 32px;text-align:center;border-top:1px solid #E2E8F5;">
              <p style="margin:0;color:#94A3B8;font-size:11.5px;line-height:1.6;">
                Colbisnes &middot; El marketplace colombiano de segunda mano<br/>
                Este correo fue enviado automaticamente, por favor no respondas a este mensaje.
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
