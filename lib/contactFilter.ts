// Detecta y oculta datos de contacto externo (teléfono, WhatsApp, redes, correo)
// dentro de los mensajes del chat. Objetivo: reducir el riesgo de que la conversación
// —y sobre todo las FUTURAS compras entre las mismas dos personas— se muden fuera de
// Colbisnes, donde ya no hay protección de pago ni comisión.
//
// Estrategia: no bloqueamos el mensaje (mala experiencia, mucha fricción), lo dejamos
// pasar pero con el dato sensible reemplazado por un aviso visible para ambas partes.

const PLACEHOLDER = "[dato de contacto oculto por seguridad]";

// Correos electrónicos
const RE_EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Enlaces directos a apps de mensajería / redes sociales
const RE_SOCIAL_LINK = /(https?:\/\/)?(www\.)?(wa\.me|api\.whatsapp\.com|whatsapp\.com|t\.me|telegram\.me|instagram\.com|facebook\.com|fb\.com|m\.me)\/\S+/gi;

// Menciones tipo @usuario (instagram/telegram)
const RE_HANDLE = /(^|\s)@[a-zA-Z0-9._]{3,30}/g;

// Celular colombiano: 10 dígitos que empiezan en 3, con separadores opcionales,
// con o sin indicativo +57
const RE_CEL_CO = /(\+?57[\s.-]?)?3\d{2}[\s.-]?\d{3}[\s.-]?\d{4}\b/g;

// Corridas largas de dígitos (fijos, números con formato raro) — solo se usa si
// además aparece una palabra "gatillo" de contacto, para no romper conversaciones
// normales de precios ("te lo dejo en 350000")
const RE_DIGIT_RUN = /\b\d[\d\s.-]{6,}\d\b/g;
const RE_CONTACT_WORDS = /\b(whatsapp|wsp|whats\s?app|mi\s(numero|número|cel|celular)|llámame|llamame|escr[ií]beme al|contáctame|contactame|mandame|mándame)\b/i;

export function limpiarContenidoMensaje(content: string): { contenido: string; oculto: boolean } {
  let out = content;
  let oculto = false;

  const aplicar = (re: RegExp) => {
    const nuevo = out.replace(re, PLACEHOLDER);
    if (nuevo !== out) oculto = true;
    out = nuevo;
  };

  aplicar(RE_EMAIL);
  aplicar(RE_SOCIAL_LINK);
  aplicar(RE_HANDLE);
  aplicar(RE_CEL_CO);
  if (RE_CONTACT_WORDS.test(out)) {
    aplicar(RE_DIGIT_RUN);
  }

  return { contenido: out, oculto };
}
