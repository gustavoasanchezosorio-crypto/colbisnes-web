// Base de conocimiento de "Siames", el asistente de servicio al cliente de Colbisnes.
// Los datos aqui reflejan la logica REAL ya implementada en la app (lib/pricing.ts,
// lib/businessHours.ts, lib/accountBlock.ts, etc.) — no se inventan politicas ni cifras.
// Si agregas una respuesta nueva, verifica el numero/regla contra el codigo real primero.

export interface BluIntent {
  id: string;
  /** Texto corto para mostrar como boton de respuesta rapida en el widget (si aplica) */
  quickReply?: string;
  /** Palabras o frases (en minusculas, sin tildes) que activan esta intencion */
  keywords: string[];
  /** Respuesta de Siames. Puede incluir \n para saltos de linea. */
  respuesta: string;
  /** Si es true, ademas de responder, se ofrece/crea una escalada a soporte humano */
  escalar?: boolean;
}

export const BLU_SALUDO_INICIAL =
  "¡Miau! 🐾 Soy *Siames*, el asistente de Colbisnes. Puedo explicarte como funciona la compra contra entrega, la comision de reserva, el KYC, los envios, o conectarte con soporte humano si lo necesitas. ¿En que te ayudo?";

export const BLU_FALLBACK =
  "Ronroneo... 🐾 no estoy segura de haber entendido bien eso. Puedo ayudarte con: contra entrega, comision Nequi, KYC, envios, disputas, cuentas bloqueadas o metodos de pago. Si prefieres, te conecto con una persona del equipo — solo escribe \"hablar con soporte\".";

/** Set de respuestas rapidas mostrado por defecto en el widget (cliente y servidor comparten esta lista) */
export const BLU_QUICK_REPLIES_DEFAULT = [
  "¿Cómo funciona contra entrega?",
  "¿Qué es la comisión Nequi?",
  "¿Qué es la verificación KYC?",
  "Tengo un problema con mi pedido",
  "Hablar con soporte humano",
];

export const BLU_INTENTS: BluIntent[] = [
  {
    id: "contra_entrega",
    quickReply: "¿Cómo funciona contra entrega?",
    keywords: ["contra entrega", "contraentrega", "pago contraentrega", "pagar al recibir", "efectivo al recibir", "mensajero"],
    respuesta:
      "En *contra entrega* pagas el producto en efectivo directo al mensajero cuando lo recibes. Pero antes, para reservar el producto, pagas por *Nequi* una comision de garantia a Colbisnes (no es el pago del producto).\n\nUn administrador confirma tu pago manualmente revisando tu comprobante. El vendedor tiene *24 horas habiles (8am–8pm)* desde que se crea la orden para despachar — ese plazo corre aunque tu pago aun este pendiente de confirmar. Si el vendedor no despacha a tiempo, se bloquea su cuenta y Colbisnes gestiona contigo la devolucion de tu comision.",
  },
  {
    id: "comision_nequi",
    quickReply: "¿Qué es la comisión Nequi?",
    keywords: ["comision", "comisión", "cuanto cuesta la comision", "reserva", "nequi", "garantia de reserva"],
    respuesta:
      "La comision de reserva es una *garantia*, no el pago del producto: se paga por Nequi antes del envio para reservar la compra. El porcentaje exacto depende del metodo de pago (en contra entrega es sobre el 3% del valor, y puede bajar segun tu nivel de confianza en la plataforma) — lo ves reflejado en el resumen antes de confirmar. Un administrador revisa y confirma cada pago manualmente, asi que puede tardar un poco en aparecer confirmado.",
  },
  {
    id: "kyc",
    quickReply: "¿Qué es la verificación KYC?",
    keywords: ["kyc", "verificacion", "verificar identidad", "verificarme", "cedula", "por que debo verificarme", "liveness"],
    respuesta:
      "El KYC es una verificacion de identidad con reconocimiento facial (con prueba de vida) que debes completar antes de poder *comprar o publicar* en Colbisnes — es para la seguridad de todos en la plataforma. Normalmente es rapida. Puedes hacerla desde la seccion de verificacion (te aparece un aviso arriba si aun no la has hecho, con el boton \"Verificarme ahora\").",
  },
  {
    id: "publicar_producto",
    quickReply: "¿Cómo publico un producto?",
    keywords: ["publicar", "vender", "subir producto", "como vendo", "publicar producto", "crear anuncio"],
    respuesta:
      "Toca el boton *\"+ Publicar\"* arriba en la pagina principal, completa titulo, precio, ciudad, categoria, condicion y una descripcion, agrega hasta 5 fotos, y dale a Publicar. Necesitas tener el KYC aprobado primero.\n\n¿Sabías que si subes una foto puedo ayudarte a detectar los colores del producto automaticamente? 🎨",
  },
  {
    id: "envios_tiempos",
    quickReply: "¿Cuánto tarda el envío?",
    keywords: ["envio", "envío", "tiempo de entrega", "cuando llega", "guia", "guía", "transportadora", "despachar"],
    respuesta:
      "El vendedor tiene *24 horas habiles (8am–8pm)* desde que se crea la orden para despachar el producto y registrar su guia. Despues de eso, la transportadora entrega y tu, como comprador, debes *confirmar la entrega* en la app para liberar el pago al vendedor. Si el vendedor no despacha a tiempo, se aplica una penalizacion a su cuenta.",
  },
  {
    id: "disputas",
    quickReply: "Tengo un problema con mi pedido",
    keywords: ["disputa", "problema", "reclamo", "no llego", "no llegó", "producto dañado", "danado", "estafa", "producto diferente"],
    respuesta:
      "Lamento que tengas un problema. Dentro del seguimiento de tu pedido veras el boton *\"⚠️ Reportar un problema con este pedido\"* — al usarlo, tu caso queda registrado y el equipo de Colbisnes lo revisa y te contacta. Si tenias *proteccion de compra extendida*, tu caso se revisa con prioridad.",
    escalar: true,
  },
  {
    id: "bloqueo_penalizacion",
    quickReply: "¿Por qué está bloqueada mi cuenta?",
    keywords: ["bloqueado", "bloqueada", "cuenta bloqueada", "penalizacion", "penalización", "deuda", "no puedo comprar", "no puedo vender"],
    respuesta:
      "Las cuentas se bloquean (temporalmente, para comprar y vender) cuando un vendedor no despacha un pedido de contra entrega dentro de las 24 horas habiles del plazo. Ademas de bloquear la cuenta, se genera una deuda por el valor de la comision y el puntaje de confianza baja a la mitad. Si crees que esto es un error, cuentame los detalles y lo escalo a soporte humano para revisarlo.",
    escalar: true,
  },
  {
    id: "proteccion_extendida",
    quickReply: "¿Qué es la protección extendida?",
    keywords: ["proteccion extendida", "protección extendida", "proteccion de compra"],
    respuesta:
      "La *proteccion de compra extendida* es un adicional opcional y pagado (cuesta $3.000 COP) que puedes agregar al comprar. Si algo sale mal con tu pedido, tu caso se revisa con prioridad por el equipo de Colbisnes.",
  },
  {
    id: "destacados_premium",
    quickReply: "¿Qué son los destacados?",
    keywords: ["destacado", "destacar", "premium", "aparecer primero", "badge premium"],
    respuesta:
      "Puedes *destacar* tu producto para que aparezca primero en los resultados por $8.000 COP durante 7 dias. Tambien existe la *verificacion premium* (identidad + comprobante de domicilio), un badge gratuito que da mas confianza a los compradores.",
  },
  {
    id: "usdt_cripto",
    quickReply: "¿Puedo pagar con USDT/cripto?",
    keywords: ["usdt", "cripto", "bep20", "wallet", "criptomoneda"],
    respuesta:
      "Si, puedes pagar con *USDT (red BEP20)*. El pago queda retenido de forma segura y se libera al vendedor cuando confirmas que recibiste el producto en buen estado.",
  },
  {
    id: "metodos_pago",
    quickReply: "¿Qué métodos de pago aceptan?",
    keywords: ["metodos de pago", "métodos de pago", "como pago", "wompi", "tarjeta", "formas de pago"],
    respuesta:
      "Aceptamos: *pago en linea* (tarjeta/PSE via Wompi, con el dinero retenido hasta que confirmes la entrega), *USDT cripto* (BEP20), y *contra entrega* (efectivo al mensajero + comision de reserva por Nequi).",
  },
  {
    id: "liberacion_pago",
    quickReply: "¿Cuándo me pagan como vendedor?",
    keywords: ["cuando me pagan", "liberar pago", "liberacion de pago", "me deben pagar", "no me han pagado"],
    respuesta:
      "El pago del comprador queda retenido de forma segura y se libera hacia ti apenas el comprador *confirma la entrega* en la app. Si ya te confirmaron la entrega y no ves el pago liberado despues de un rato, cuentame y lo escalo para que soporte lo revise.",
    escalar: true,
  },
  {
    id: "trust_score",
    quickReply: "¿Qué es el puntaje de confianza?",
    keywords: ["puntaje de confianza", "trust score", "reputacion", "reputación", "nivel de confianza"],
    respuesta:
      "Tu *puntaje de confianza* refleja tu historial en la plataforma (cumplimiento, calificaciones, etc.). Entre mas alto, mejores descuentos en la comision. Si incumples un despacho a tiempo en contra entrega, tu puntaje baja a la mitad.",
  },
  {
    id: "contrasena",
    quickReply: "Olvidé mi contraseña",
    keywords: ["contrasena", "contraseña", "olvide mi clave", "recuperar cuenta", "no puedo entrar"],
    respuesta:
      "Puedes recuperarla desde la pagina de inicio de sesion, en el enlace *\"¿Olvidaste tu contraseña?\"* — te llega un correo para crear una nueva.",
  },
  {
    id: "datos_perfil",
    quickReply: "Cambiar mi Nequi/datos",
    keywords: ["cambiar nequi", "actualizar datos", "editar perfil", "mi numero nequi", "cambiar telefono"],
    respuesta:
      "Puedes actualizar tu numero Nequi, telefono, ciudad y demas datos desde tu *Perfil → Editar perfil*.",
  },
  {
    id: "hablar_con_humano",
    quickReply: "Hablar con soporte humano",
    keywords: ["hablar con soporte", "hablar con humano", "persona real", "agente", "soporte humano", "atencion al cliente", "quiero hablar con alguien"],
    respuesta:
      "Claro, te conecto con el equipo de Colbisnes. Cuentame brevemente que necesitas y en un momento un humano del equipo te contacta.",
    escalar: true,
  },
];

/** Quita tildes y pasa a minusculas para comparar texto de forma mas tolerante. */
export function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita marcas diacriticas combinantes (tildes) tras normalize("NFD")
    .trim();
}

/**
 * Encuentra la intencion que mejor coincide con el mensaje del usuario.
 * Las frases de varias palabras pesan mas que una sola palabra suelta,
 * para reducir falsos positivos entre intenciones parecidas (ej. "pago").
 */
export function matchIntent(mensaje: string): BluIntent | null {
  const texto = normalizarTexto(mensaje);
  let mejor: { intent: BluIntent; score: number } | null = null;

  for (const intent of BLU_INTENTS) {
    let score = 0;
    for (const kw of intent.keywords) {
      const kwNorm = normalizarTexto(kw);
      if (!kwNorm) continue;
      if (texto.includes(kwNorm)) {
        score += kwNorm.includes(" ") ? 3 : 1;
      }
    }
    if (score > 0 && (!mejor || score > mejor.score)) {
      mejor = { intent, score };
    }
  }

  return mejor?.intent ?? null;
}

/** Saludo simple para detectar si el mensaje es solo un saludo (no cuenta como intencion real) */
export function esSaludo(mensaje: string): boolean {
  const texto = normalizarTexto(mensaje);
  return /^(hola|holaa+|buenas|buenos dias|buenas tardes|buenas noches|hey|ola|hi)[\s!.,]*$/.test(texto);
}
