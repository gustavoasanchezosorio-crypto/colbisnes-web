// Cómo se entrega un producto y cuánto cuesta mandarlo.
//
// Contexto de por qué existe este archivo (2026-09-02): la maquinaria de envíos ya
// estaba escrita y funcionando —la ficha del producto muestra pestañas de envío /
// en persona, el checkout se salta la dirección cuando es en persona, y
// `calcularExtrasCheckout` cobra el envío y le suma el margen de Colbisnes— pero
// nunca llegaba a usarse: el formulario de publicar jamás preguntó ninguna de las
// dos cosas. Como `tipoEntrega` tiene `@default("ENVIO")` en el schema, TODOS los
// productos nacían ofreciendo despacho a domicilio, incluido un carro de $46
// millones, y con `precioEnvio` en null. Resultado: el comprador leía "envío a
// coordinar" y el margen de envío nunca se cobró ni una vez.
//
// Las reglas viven aquí y no dentro de cada ruta porque hay CUATRO sitios que
// tienen que estar de acuerdo (publicar, editar, y las dos rutas de API que los
// guardan). Cuando una regla vive copiada en cuatro lados, tarde o temprano se
// arregla en tres.

export const TIPOS_ENTREGA = ["ENVIO", "EN_PERSONA", "AMBOS"] as const;
export type TipoEntrega = (typeof TIPOS_ENTREGA)[number];

export const ETIQUETAS_ENTREGA: Record<TipoEntrega, string> = {
  ENVIO: "Solo envío a domicilio",
  EN_PERSONA: "Solo entrega en persona",
  AMBOS: "Envío o en persona, lo que prefiera el comprador",
};

/** Un producto "tiene envío" si se despacha, sea o no la única forma de entrega. */
export function incluyeEnvio(tipoEntrega: string): boolean {
  return tipoEntrega === "ENVIO" || tipoEntrega === "AMBOS";
}

/**
 * Solo se puede fijar un costo de envío cuando el producto SIEMPRE se despacha.
 *
 * En AMBOS el comprador escoge en la ficha entre "Con envío" y "En persona", pero
 * esa pestaña es solo visual: no viaja al checkout. `calcularExtrasCheckout` mira
 * únicamente `tipoEntrega`, y AMBOS cuenta como "tiene envío", así que a quien
 * pensaba recoger el producto en un centro comercial se le cobraría el flete más
 * el 10% de margen igual. Cobrar de más en una app de plata no se arregla con una
 * nota en la descripción.
 *
 * Mientras el checkout no sepa cuál de las dos escogió el comprador, AMBOS va
 * siempre "a coordinar por el chat" (precioEnvio null → envioCobrado = 0). El
 * vendedor que quiera cobrar un valor fijo escoge "solo envío", que es justo el
 * caso donde ese valor es cierto siempre.
 */
export function permiteCostoFijoDeEnvio(tipoEntrega: string): boolean {
  return tipoEntrega === "ENVIO";
}

// Piso y techo del costo de envío declarado por el vendedor.
//
// El piso son $1.000 porque por debajo de eso no hay transportadora en Colombia y
// casi siempre es un dedazo (escribir 500 queriendo 5.000). No se acepta 0: hoy
// no existe la idea de "envío gratis" en el resto del sistema —`calcularExtrasCheckout`
// trata el 0 igual que el null— así que dejar pasar un 0 mostraría "envío a
// coordinar" en la ficha y confundiría a todo el mundo. Quien quiera regalar el
// envío escoge "lo coordino con el comprador" y se lo dice por el chat.
//
// El techo son $2.000.000 para atajar el dedazo al otro lado (un cero de más
// convierte $30.000 en $300.000 y el comprador lo ve en el total sin entender por qué).
export const PISO_PRECIO_ENVIO = 1000;
export const TECHO_PRECIO_ENVIO = 2_000_000;

export interface EntregaNormalizada {
  tipoEntrega: TipoEntrega;
  /** null = "lo coordino con el comprador por el chat". Un número = precio fijo. */
  precioEnvio: number | null;
}

export type ResultadoEntrega =
  | ({ ok: true } & EntregaNormalizada)
  | { ok: false; error: string };

/**
 * Valida y normaliza lo que llega del formulario. Se usa IGUAL al crear y al editar:
 * si el piso de precio de un producto solo se comprobara al crear, bastaría con
 * publicar bien y editar mal un minuto después. Aquí pasa lo mismo con el envío.
 *
 * `precioEnvio` se ignora a propósito cuando la entrega es solo en persona: no hay
 * paquete que despachar, y guardar un costo de envío ahí solo puede terminar
 * cobrándoselo a alguien que va a recoger el producto en un centro comercial.
 */
export function normalizarEntrega(
  tipoEntregaCrudo: unknown,
  precioEnvioCrudo: unknown
): ResultadoEntrega {
  if (
    typeof tipoEntregaCrudo !== "string" ||
    !(TIPOS_ENTREGA as readonly string[]).includes(tipoEntregaCrudo)
  ) {
    return { ok: false, error: "Dinos cómo entregas el producto: por envío, en persona, o las dos." };
  }
  const tipoEntrega = tipoEntregaCrudo as TipoEntrega;

  // Dos casos en los que el costo de envío no aplica y se descarta en silencio,
  // en vez de devolver error: el formulario ni siquiera muestra la casilla, así
  // que si llega un número es basura del cliente, no algo que el vendedor pidió.
  //
  //  - EN_PERSONA: no hay paquete que despachar.
  //  - AMBOS: el checkout no sabe cuál escogió el comprador (ver
  //    permiteCostoFijoDeEnvio), y ante la duda no se le cobra a nadie de más.
  if (!permiteCostoFijoDeEnvio(tipoEntrega)) {
    return { ok: true, tipoEntrega, precioEnvio: null };
  }

  // null / undefined / "" significan "a coordinar por el chat". Es una respuesta
  // válida y deliberada, no un campo sin llenar: en Colombia mandar algo a Chía y
  // mandarlo a Leticia no cuestan ni parecido, y obligar a un número único haría
  // que el vendedor pusiera el del peor caso para no perder plata.
  if (precioEnvioCrudo === null || precioEnvioCrudo === undefined || precioEnvioCrudo === "") {
    return { ok: true, tipoEntrega, precioEnvio: null };
  }

  const precioEnvio =
    typeof precioEnvioCrudo === "number" ? precioEnvioCrudo : Number(precioEnvioCrudo);

  if (!Number.isFinite(precioEnvio) || !Number.isInteger(precioEnvio)) {
    return { ok: false, error: "El costo del envío debe ser un número entero en pesos." };
  }
  if (precioEnvio < PISO_PRECIO_ENVIO) {
    return {
      ok: false,
      error: `El costo del envío no puede ser menor a $${PISO_PRECIO_ENVIO.toLocaleString("es-CO")}. Si prefieres no fijarlo, escoge "lo coordino con el comprador".`,
    };
  }
  if (precioEnvio > TECHO_PRECIO_ENVIO) {
    return {
      ok: false,
      error: `El costo del envío no puede superar $${TECHO_PRECIO_ENVIO.toLocaleString("es-CO")}. Revisa que no te haya sobrado un cero.`,
    };
  }

  return { ok: true, tipoEntrega, precioEnvio };
}

// ── Peso aproximado del producto ─────────────────────────────────────────────
//
// Por qué existe (2026-10-29): la tarifa de respaldo de envío (lib/tarifasEnvio.ts),
// que entra en juego cuando el vendedor no fijó su propio precioEnvio, necesita
// saber cuánto pesa el paquete para no inventar un número. Antes de este campo esa
// combinación (envío + sin precioEnvio) simplemente cobraba $0 sin avisarle a nadie
// — el mismo incidente documentado en el comentario de Product.pesoAprox del schema.
//
// Cuatro brackets, no un número exacto en gramos: nadie pesa su producto antes de
// publicar, y pedir un número preciso generaría basura (la gente adivina). Un bracket
// amplio es más honesto con lo que el vendedor de verdad sabe.
export const PESOS_PRODUCTO = ["MENOS_1KG", "DE_1_A_5KG", "DE_5_A_20KG", "MAS_20KG"] as const;
export type PesoProducto = (typeof PESOS_PRODUCTO)[number];

export const ETIQUETAS_PESO: Record<PesoProducto, string> = {
  MENOS_1KG: "Menos de 1 kg",
  DE_1_A_5KG: "Entre 1 y 5 kg",
  DE_5_A_20KG: "Entre 5 y 20 kg",
  MAS_20KG: "Más de 20 kg",
};

export type ResultadoPeso =
  | { ok: true; pesoAprox: PesoProducto | null }
  | { ok: false; error: string };

/**
 * Exige un peso válido cuando el producto se despacha (incluyeEnvio), sin importar si
 * el vendedor fijó o no un precioEnvio propio: aunque hoy solo lo use el fallback de
 * lib/tarifasEnvio.ts, pedir el peso desde que se crea la publicación evita que
 * publicaciones viejas de "antes del campo" sigan naciendo sin él — mismo espíritu que
 * normalizarEntrega. Las publicaciones que ya existían antes de este campo NO se
 * migran de golpe: se quedan con pesoAprox null hasta que alguien las edite.
 *
 * En EN_PERSONA el peso no aplica (no hay paquete que despachar) y se descarta en
 * silencio, igual que precioEnvio en normalizarEntrega.
 */
export function normalizarPeso(
  tipoEntregaCrudo: unknown,
  pesoCrudo: unknown
): ResultadoPeso {
  const tipoEntrega = typeof tipoEntregaCrudo === "string" ? tipoEntregaCrudo : "";

  if (!incluyeEnvio(tipoEntrega)) {
    return { ok: true, pesoAprox: null };
  }

  if (pesoCrudo === null || pesoCrudo === undefined || pesoCrudo === "") {
    return { ok: false, error: "Dinos un peso aproximado del producto para poder calcularte el envío." };
  }

  if (typeof pesoCrudo !== "string" || !(PESOS_PRODUCTO as readonly string[]).includes(pesoCrudo)) {
    return { ok: false, error: "El peso aproximado no es válido." };
  }

  return { ok: true, pesoAprox: pesoCrudo as PesoProducto };
}
