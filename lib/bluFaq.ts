// Base de conocimiento de "Chucho Bot", el asistente de servicio al cliente de Colbisnes.
// Los datos aqui reflejan la logica REAL ya implementada en la app (lib/pricing.ts,
// lib/businessHours.ts, lib/accountBlock.ts, etc.) — no se inventan politicas ni cifras.
// Si agregas una respuesta nueva, verifica el numero/regla contra el codigo real primero.
//
// TONO (decision del 2026-08-09): Chucho le habla al cliente como le hablaria un
// colombiano en un negocio, no como un manual. Tutea, va al grano, usa "de una",
// "claro que si", "tranquilo", "te cuento", "que pena contigo". Habla de si mismo en
// MASCULINO aunque el avatar sea una gata siamesa: manda el nombre, que es masculino.
//
// NADA de sonidos de gato. Iban un "Ronroneo..." al no entender y un "se me enredo un
// bigote" al fallar la conexion, y los dos salian justo cuando el cliente ya venia
// molesto: quedan como burla. La huellita 🐾 se queda (es la firma de Chucho), el
// maullido no. Si vas a agregar una respuesta, di las cosas de frente.
//
// Lo que NO cambia con el tono: ninguna cifra, plazo ni regla. Si al reescribir una
// respuesta te dan ganas de redondear un numero o suavizar un plazo, no lo hagas.

/**
 * Numero de atencion de Colbisnes por WhatsApp, en formato internacional y sin signos.
 *
 * Se usa SOLO para armar el enlace wa.me. A proposito no existe una version "bonita"
 * para pintar en pantalla: el numero no se le muestra escrito al cliente. Si lo ve, lo
 * copia y sigue negociando por fuera de Colbisnes — sin pedido, sin historial y sin
 * manera de respaldar a nadie si algo sale mal. Que entre siempre por el boton.
 */
export const COLBISNES_WHATSAPP = "573108485444";

/**
 * Enlace que abre WhatsApp con el mensaje ya escrito hacia el numero de Colbisnes.
 *
 * Por que asi y no un envio automatico: mandar un WhatsApp desde el servidor exige la
 * API de WhatsApp Business (via Twilio o Meta), y para escribirle primero a alguien que
 * no te ha escrito hace falta una plantilla aprobada por Meta. Eso no se monta en tres
 * dias y cuesta mensualidad. Con wa.me el cliente da un toque y el mensaje entra al
 * telefono de Colbisnes como una conversacion normal — funciona hoy y sin costo.
 *
 * El texto se codifica porque va en la URL: sin encodeURIComponent, un "&" o un salto
 * de linea del cliente parte el enlace.
 */
export function urlWhatsappSoporte(mensaje?: string): string {
  const texto = (mensaje || "").trim() || "Hola, vengo de colbisnes.com y necesito ayuda.";
  return `https://wa.me/${COLBISNES_WHATSAPP}?text=${encodeURIComponent(texto)}`;
}

export interface BluIntent {
  id: string;
  /** Texto corto para mostrar como boton de respuesta rapida en el widget (si aplica) */
  quickReply?: string;
  /** Palabras o frases (en minusculas, sin tildes) que activan esta intencion */
  keywords: string[];
  /** Respuesta de Chucho Bot. Puede incluir \n para saltos de linea. */
  respuesta: string;
  /** Si es true, ademas de responder, se ofrece/crea una escalada a soporte humano */
  escalar?: boolean;
}

export const BLU_SALUDO_INICIAL =
  "🐾 ¡Hola! Soy *Chucho*, el asistente de Colbisnes.\n\nCuéntame qué necesitas y te ayudo de una: cómo funciona el contra entrega, la comisión de reserva, la verificación de identidad, los envíos... Y si prefieres hablar con una persona del equipo, claro que sí, también te la consigo.\n\n¿En qué te ayudo?";

export const BLU_FALLBACK =
  "Uy, esa no te la entendí bien 🐾 qué pena contigo.\n\nTe puedo ayudar con: contra entrega, comisión de reserva, verificación de identidad, envíos, problemas con un pedido, cuentas bloqueadas o formas de pago.\n\nY si prefieres hablar con alguien del equipo, de una — solo dime \"hablar con soporte\".";

/** Set de respuestas rapidas mostrado por defecto en el widget (cliente y servidor comparten esta lista) */
export const BLU_QUICK_REPLIES_DEFAULT = [
  "¿Cómo funciona el contra entrega?",
  "¿Qué es la comisión de reserva?",
  "¿Cómo me verifico?",
  "Tengo un problema con mi pedido",
  "Quiero hablar con una persona",
];

export const BLU_INTENTS: BluIntent[] = [
  {
    id: "contra_entrega",
    quickReply: "¿Cómo funciona el contra entrega?",
    keywords: ["contra entrega", "contraentrega", "pago contraentrega", "pagar al recibir", "efectivo al recibir", "mensajero"],
    respuesta:
      "Te cuento cómo va: en *contra entrega* pagas el producto en efectivo, directo al mensajero, cuando ya lo tienes en la mano.\n\nAntes de eso, para apartarlo, pagas por *Nequi* una comisión de garantía a Colbisnes. Ojo con esto: esa comisión NO es el pago del producto, es lo que reserva tu compra.\n\nUn administrador revisa tu comprobante y confirma el pago a mano. El vendedor tiene *24 horas hábiles (8am–8pm)* desde que se crea la orden para despachar, y ese plazo corre así tu pago todavía esté por confirmar.\n\nSi no despacha a tiempo, se le bloquea la cuenta y nosotros te gestionamos la devolución de tu comisión.",
  },
  {
    id: "comision_nequi",
    quickReply: "¿Qué es la comisión de reserva?",
    keywords: ["comision", "comisión", "cuanto cuesta la comision", "comision de reserva", "reserva", "nequi", "garantia de reserva"],
    respuesta:
      "La comisión de reserva es una *garantía*, no el pago del producto: la pagas por Nequi antes del envío para apartar tu compra.\n\nEl porcentaje depende del método de pago — en contra entrega ronda el *3% del valor*, y te puede bajar según tu nivel de confianza en la plataforma. Tranquilo que lo ves clarito en el resumen antes de confirmar nada.\n\nCada pago lo revisa y confirma un administrador a mano, así que puede demorarse un poquito en aparecer como confirmado.",
  },
  {
    id: "kyc",
    quickReply: "¿Cómo me verifico?",
    keywords: ["kyc", "verificacion", "verificar identidad", "verificarme", "me verifico", "como me verifico", "verifico", "cedula", "por que debo verificarme", "liveness"],
    respuesta:
      "Es un chequeo de identidad con prueba de vida que tienes que hacer antes de *comprar o publicar*. Es para que todos en Colbisnes sepamos con quién estamos negociando.\n\nEs rápido, de verdad: lo haces desde la sección de verificación. Si todavía no la has hecho, te sale un aviso arriba con el botón \"Verificarme ahora\". De una y listo.",
  },
  {
    id: "publicar_producto",
    quickReply: "¿Cómo publico un producto?",
    // "publico" y "publicar" van los dos: el boton dice "¿Cómo publico un producto?"
    // y sin la primera forma el propio boton de Chucho no encontraba su respuesta.
    keywords: ["publicar", "publico", "como publico", "vender", "subir producto", "como vendo", "publicar producto", "crear anuncio"],
    respuesta:
      "¡De una! Toca el botón *\"+ Publicar\"* arriba en la página principal. Llenas título, precio, ciudad, categoría, condición y una descripción, le montas hasta 5 fotos, y le das a Publicar.\n\nEso sí: necesitas tener la verificación de identidad aprobada primero.\n\nAh, y un dato: si subes una foto, yo te ayudo a detectar los colores del producto automáticamente 🎨",
  },
  {
    id: "envios_tiempos",
    quickReply: "¿Cuánto tarda el envío?",
    keywords: ["envio", "envío", "tiempo de entrega", "cuando llega", "guia", "guía", "transportadora", "despachar"],
    respuesta:
      "El vendedor tiene *24 horas hábiles (8am–8pm)* desde que se crea la orden para despachar y registrar la guía. De ahí en adelante la transportadora hace lo suyo.\n\nCuando te llegue, tú como comprador tienes que *confirmar la entrega* en la app — eso es lo que le libera el pago al vendedor.\n\nSi el vendedor no despacha a tiempo, le cae una penalización en la cuenta.",
  },
  {
    id: "disputas",
    quickReply: "Tengo un problema con mi pedido",
    // Las variantes de "no llego" estan escritas como las teclea un cliente de verdad,
    // no como las diria un manual: "no me ha llegado" es la queja mas frecuente y con
    // solo "no llego" en la lista se caia al mensaje generico de "no te entendi".
    keywords: [
      "disputa", "problema", "reclamo", "estafa", "producto diferente",
      "no llego", "no llegó", "no me llego", "no me ha llegado", "no ha llegado",
      "sigue sin llegar", "nunca llego", "no me lo han entregado",
      "producto dañado", "danado", "llego roto", "llego dañado",
    ],
    respuesta:
      "Qué pena contigo que te haya pasado. Vamos a resolverlo.\n\nEn el seguimiento de tu pedido te aparece el botón *\"⚠️ Reportar un problema con este pedido\"* — al usarlo tu caso queda registrado y el equipo lo revisa y te contacta.\n\nSi tenías *protección de compra extendida*, tu caso pasa de primero.",
    escalar: true,
  },
  {
    id: "bloqueo_penalizacion",
    quickReply: "¿Por qué está bloqueada mi cuenta?",
    keywords: ["bloqueado", "bloqueada", "cuenta bloqueada", "penalizacion", "penalización", "deuda", "no puedo comprar", "no puedo vender"],
    respuesta:
      "Te explico por qué pasa: la cuenta se bloquea temporalmente —para comprar y para vender— cuando un vendedor no despacha un pedido de contra entrega dentro de las 24 horas hábiles del plazo.\n\nAdemás del bloqueo queda una deuda por el valor de la comisión, y el puntaje de confianza baja a la mitad.\n\nSi crees que es un error, cuéntame qué pasó y lo paso de una a una persona del equipo para que lo revise.",
    escalar: true,
  },
  {
    id: "proteccion_extendida",
    quickReply: "¿Qué es la protección extendida?",
    keywords: ["proteccion extendida", "protección extendida", "proteccion de compra"],
    respuesta:
      "Es un adicional opcional que le puedes agregar a tu compra, cuesta *$3.000 COP*.\n\nCon ella, si algo sale mal con tu pedido, el equipo de Colbisnes te revisa el caso con prioridad. Vale la pena si el producto es de buen valor.",
  },
  {
    id: "destacados_premium",
    quickReply: "¿Qué son los destacados?",
    keywords: ["destacado", "destacar", "aparecer primero"],
    respuesta:
      "Puedes *destacar* tu producto para que salga de primero en los resultados: *$8.000 COP por 7 días*. Buena si tienes afán de vender.",
  },
  {
    id: "usdt_cripto",
    quickReply: "¿Puedo pagar con USDT/cripto?",
    keywords: ["usdt", "cripto", "bep20", "wallet", "criptomoneda"],
    respuesta:
      "¡Claro que sí! Puedes pagar con *USDT (red BEP20)*.\n\nEl pago queda retenido y se le libera al vendedor solamente cuando tú confirmas que recibiste el producto en buen estado.",
  },
  {
    id: "metodos_pago",
    quickReply: "¿Qué métodos de pago aceptan?",
    keywords: ["metodos de pago", "métodos de pago", "como pago", "wompi", "tarjeta", "formas de pago"],
    respuesta:
      "Tienes tres formas:\n\n• *Pago en línea* — tarjeta o PSE por Wompi, con el dinero retenido hasta que confirmes la entrega.\n• *USDT cripto* — red BEP20, también con el dinero retenido.\n• *Contra entrega* — efectivo al mensajero, más la comisión de reserva por Nequi.\n\nDime cuál te sirve y te la explico a fondo.",
  },
  {
    id: "liberacion_pago",
    quickReply: "¿Cuándo me pagan como vendedor?",
    keywords: ["cuando me pagan", "liberar pago", "liberacion de pago", "me deben pagar", "no me han pagado"],
    respuesta:
      "La plata del comprador queda retenida y se te libera apenas él *confirme la entrega* en la app.\n\nSi ya te la confirmaron y no ves el pago después de un rato, cuéntame y lo paso de una al equipo para que lo revisen.",
    escalar: true,
  },
  {
    id: "trust_score",
    quickReply: "¿Qué es el puntaje de confianza?",
    keywords: ["puntaje de confianza", "trust score", "reputacion", "reputación", "nivel de confianza"],
    respuesta:
      "Tu *puntaje de confianza* es tu hoja de vida en Colbisnes: refleja si cumples, cómo te califican, todo eso. Entre más alto lo tengas, mejores descuentos consigues en la comisión.\n\nOjo con esto: si incumples un despacho a tiempo en contra entrega, el puntaje se te baja a la mitad.",
  },
  {
    id: "contrasena",
    quickReply: "Olvidé mi contraseña",
    keywords: ["contrasena", "contraseña", "olvide mi clave", "recuperar cuenta", "no puedo entrar"],
    respuesta:
      "Tranquilo, eso se recupera fácil: en la página de inicio de sesión le das a *\"¿Olvidaste tu contraseña?\"* y te llega un correo para crear una nueva.",
  },
  {
    id: "datos_perfil",
    quickReply: "Cambiar mi Nequi/datos",
    // Las frases con "nequi" tienen que ser de VARIAS palabras para ganarle a la
    // intencion de la comision, que se activa con "nequi" a secas: las de varias
    // palabras puntuan 3 y las sueltas 1. Sin "cambiar mi nequi", el boton
    // "Cambiar mi Nequi/datos" contestaba lo de la comision de reserva.
    keywords: ["cambiar nequi", "cambiar mi nequi", "actualizar datos", "cambiar datos", "mis datos", "editar perfil", "mi perfil", "mi numero nequi", "cambiar telefono"],
    respuesta:
      "Eso lo cambias tú mismo: entra a tu *Perfil → Editar perfil* y ahí actualizas tu número Nequi, teléfono, ciudad y lo demás.",
  },
  {
    id: "hablar_con_humano",
    quickReply: "Quiero hablar con una persona",
    keywords: [
      "hablar con soporte", "hablar con humano", "hablar con una persona", "con una persona",
      "persona real", "agente", "soporte humano", "atencion al cliente",
      "quiero hablar con alguien", "hablar con alguien", "asesor", "whatsapp",
    ],
    respuesta:
      "¡Claro que sí! Te pongo en contacto con alguien del equipo de Colbisnes de una.\n\nLo más rápido es que nos escribas por WhatsApp con el botón verde de aquí abajo 👇 — ahí te contesta una persona de verdad.",
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
