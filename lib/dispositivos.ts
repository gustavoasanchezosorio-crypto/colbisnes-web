// Datos declarados por el vendedor para dispositivos con IMEI (celulares, tablets,
// modems) y piso de precio por categoría.
//
// Este archivo es la ÚNICA fuente de verdad de estas reglas: lo importan el
// formulario de publicar (app/page.tsx), la página de editar y las dos rutas de
// API que escriben productos. Si se duplica la lógica en el cliente y en el
// servidor, tarde o temprano divergen y el formulario deja pasar algo que la API
// rechaza (o peor: al revés).
//
// ADVERTENCIA LEGAL, no es un detalle de estilo: Colbisnes NO verifica nada de
// esto. Todo lo que hay aquí lo escribe el vendedor. En ningún texto de la
// interfaz se debe decir "verificado", "comprobado" ni "garantizado por
// Colbisnes": si Colbisnes afirma que un equipo está limpio y resulta reportado
// como robado, la responsabilidad deja de ser del vendedor y pasa a ser de la
// plataforma. La fórmula correcta siempre es "declarado por el vendedor".

// ─────────────────────────────────────────────────────────────────────────────
// 1. Qué categorías piden datos de dispositivo
// ─────────────────────────────────────────────────────────────────────────────

// Debe coincidir con el id de lib/theme.ts (CATEGORIES), no con la etiqueta.
export const CATEGORIA_DISPOSITIVOS = "Tecnologia";

export function categoriaPideDatosDeDispositivo(categoria: unknown): boolean {
  return categoria === CATEGORIA_DISPOSITIVOS;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. IMEI
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deja el IMEI en 15 dígitos limpios, o null si no se parece a un IMEI.
 * La gente lo copia y pega desde los ajustes del teléfono, donde suele venir con
 * espacios o guiones; también acepta el prefijo que a veces trae iOS.
 */
export function normalizarImei(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const soloDigitos = valor.replace(/\D/g, "");
  if (soloDigitos.length !== 15) return null;
  return soloDigitos;
}

/**
 * Verifica el dígito de control del IMEI con el algoritmo de Luhn.
 *
 * Esto NO dice si el equipo es robado — eso está en la base del SRTM y no lo
 * podemos consultar desde aquí. Lo que sí hace, y es mucho para lo que cuesta,
 * es descartar los números inventados a mano: el último dígito de todo IMEI se
 * calcula a partir de los otros catorce, así que un número tecleado al azar
 * falla con probabilidad 9 de cada 10.
 */
export function imeiTieneDigitoDeControlValido(imei: string): boolean {
  if (!/^\d{15}$/.test(imei)) return false;
  let suma = 0;
  // Se recorre de derecha a izquierda; se duplica uno de cada dos dígitos
  // empezando por el segundo (el primero por la derecha es el de control).
  for (let i = 0; i < 15; i++) {
    let d = imei.charCodeAt(14 - i) - 48;
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9; // equivale a sumar sus dos cifras
    }
    suma += d;
  }
  return suma % 10 === 0;
}

export function esImeiValido(valor: unknown): boolean {
  const n = normalizarImei(valor);
  return n !== null && imeiTieneDigitoDeControlValido(n);
}

export type ImeiValidado =
  | { ok: true; imei: string | null; digitoDeControlOk: boolean }
  | { ok: false; error: string };

/**
 * Valida UN IMEI y devuelve el error ya redactado, con la etiqueta de la casilla
 * que falló ("IMEI 1" o "IMEI 2"). Sin la etiqueta, quien se equivoca en la
 * segunda casilla ve un error genérico y revisa la primera.
 *
 * Vacío es válido y devuelve null: ningún IMEI es obligatorio.
 *
 * EL DÍGITO DE CONTROL NO BLOQUEA, y esto es deliberado. Antes sí lo hacía y
 * estaba mal: se rechazó un equipo real de un vendedor real. El dígito de control
 * sirve para atrapar números tecleados al azar, pero hay IMEIs legítimos que no lo
 * cumplen —equipos de marcas menores, genéricos, pantallas que muestran el número
 * en otro formato— y el precio de equivocarse es que alguien con un teléfono de
 * verdad en la mano no pueda publicar y se vaya creyendo que la web está rota.
 *
 * El razonamiento de fondo: Colbisnes NO verifica nada. La verdad sobre un IMEI
 * está en el SRTM, que consulta el comprador antes de pagar. Una revisión que no
 * consulta ninguna base no puede tener poder de veto sobre una venta. Se informa y
 * se deja decidir a quien tiene el aparato en la mano.
 */
export function validarUnImei(valor: unknown, etiqueta: string): ImeiValidado {
  if (valor === undefined || valor === null || String(valor).trim() === "") {
    return { ok: true, imei: null, digitoDeControlOk: true };
  }
  const n = normalizarImei(valor);
  if (!n) {
    return {
      ok: false,
      error: `El ${etiqueta} debe tener 15 dígitos. Márcalo en el teclado del teléfono: *#06#`,
    };
  }
  return { ok: true, imei: n, digitoDeControlOk: imeiTieneDigitoDeControlValido(n) };
}

/**
 * El aviso que se le muestra a quien escribe un IMEI que no cuadra con su dígito
 * de control. Está aquí para que el formulario de publicar y el de editar digan
 * exactamente lo mismo.
 *
 * Dice "revisa" y no "está mal" a propósito: en la mayoría de los casos es un
 * número mal copiado, pero en algunos el equipo es así, y el vendedor honesto no
 * tiene por qué sentir que se le está acusando de algo.
 */
export function avisoDigitoDeControl(etiqueta: string): string {
  return `Revisa el ${etiqueta}: no cuadra con su dígito de control, así que puede tener un número cambiado. Si lo comparaste con *#06# y es el de tu equipo, publícalo así.`;
}

export type ImeisValidados =
  | { ok: true; imei: string | null; imei2: string | null; algunoSinDigitoDeControl: boolean }
  | { ok: false; error: string };

/**
 * Valida el PAR de IMEI de una publicación.
 *
 * Casi todos los celulares que se venden hoy son de dos SIM y traen dos IMEI, uno
 * por ranura. Pedir uno solo obligaba al vendedor a escoger cuál declarar —o a
 * meter los dos en la misma casilla separados por coma, donde la validación no
 * sirve de nada y el comprador no sabe cuál es cuál.
 *
 * El segundo es opcional a propósito: las tablets, los módems y los celulares de
 * una sola SIM tienen uno solo, y exigirlo dejaría fuera publicaciones legítimas.
 *
 * Las dos revisiones del par, más allá de validar cada número por separado:
 *  - Si solo viene el segundo, se pide moverlo al primero en vez de reacomodarlo
 *    en silencio. Reordenar datos que el vendedor escribió, sin decírselo, es
 *    justo lo que no se puede hacer en el campo que sirve para resolver disputas.
 *  - Si los dos son iguales, es un copiar y pegar: en un equipo de dos SIM los dos
 *    IMEI SIEMPRE son distintos (comparten los 14 primeros dígitos y cambian en el
 *    de control). Dejarlo pasar sería declarar como dual-SIM algo que no lo es.
 */
export function validarImeisDeclarados(valor1: unknown, valor2: unknown): ImeisValidados {
  const uno = validarUnImei(valor1, "IMEI 1");
  if (!uno.ok) return uno;
  const dos = validarUnImei(valor2, "IMEI 2");
  if (!dos.ok) return dos;

  if (!uno.imei && dos.imei) {
    return {
      ok: false,
      error:
        "Escribe primero el IMEI 1. Si el equipo tiene un solo IMEI, va en esa casilla y la segunda se deja vacía.",
    };
  }
  if (uno.imei && dos.imei && uno.imei === dos.imei) {
    return {
      ok: false,
      error:
        "Los dos IMEI son el mismo número. En un equipo de dos SIM son distintos, casi siempre por el último dígito. Si tu equipo tiene un solo IMEI, deja la segunda casilla vacía.",
    };
  }
  // No bloquea; se devuelve para poder dejarlo escrito en la auditoría. Si un día
  // hay una disputa por un IMEI que no era el del equipo, sirve saber que el aviso
  // se mostró y que el vendedor publicó de todos modos.
  return {
    ok: true,
    imei: uno.imei,
    imei2: dos.imei,
    algunoSinDigitoDeControl: !uno.digitoDeControlOk || !dos.digitoDeControlOk,
  };
}

/**
 * Versión pública del IMEI: se ven los 6 primeros y los 2 últimos.
 *
 * Los 6 primeros son el TAC, que identifica MARCA Y MODELO, no el aparato: sirven
 * para que el comprador confirme que el número corresponde al equipo de las
 * fotos. Los 7 del medio son los que identifican la unidad concreta y por eso se
 * tapan: con un IMEI ajeno completo se clona un equipo, y publicar miles de ellos
 * en abierto convertiría el catálogo en una fuente de IMEIs para clonar.
 *
 * El número completo solo lo ve el vendedor (es suyo) y el comprador que ya tiene
 * la oferta aceptada, que es quien lo necesita para consultarlo antes de pagar.
 */
export function enmascararImei(imei: string | null | undefined): string | null {
  const n = normalizarImei(imei);
  if (!n) return null;
  return `${n.slice(0, 6)}•••••••${n.slice(13)}`;
}

// Consulta pública oficial del SRTM (Sistema de Registro de Terminal Móvil),
// creado por la Ley 1453 de 2011 art. 106 y la Resolución CRC 3128 de 2011.
// Es un formulario para personas: NO tiene API, así que el enlace lo abre el
// comprador y la consulta la hace él, no Colbisnes.
export const URL_CONSULTA_IMEI_OFICIAL = "https://www.imeicolombia.com.co/";

// Estados de Order en los que la plata YA se movió. Lo usan el endpoint que
// entrega el IMEI (app/api/products/[id]/imei) y la ficha del producto.
export const ESTADOS_CON_PLATA_MOVIDA = [
  "PAGADO",           // online: escrow fondeado
  "ESPERANDO_ENVIO",  // contra entrega: comisión de reserva ya confirmada
  "EN_CAMINO",
  "ENTREGADO",
  "COMPLETADO",
] as const;

// Contra entrega: la orden nace aquí, cuando el comprador reserva el equipo y
// ANTES de que pague la comisión de reserva.
export const ESTADO_RESERVA_CONTRA_ENTREGA = "ESPERANDO_COMISION";

/**
 * ¿Esta orden le da derecho a su comprador a ver el IMEI completo?
 *
 * Dos caminos, y la diferencia entre ellos es dónde está la plata:
 *
 *   • Pago en línea / USDT: desde que el pago se confirma. Antes de eso no se
 *     muestra. No hace falta: el escrow lo cubre. Cuando ve el número, Colbisnes
 *     todavía tiene el dinero, así que si consulta el SRTM y el equipo aparece
 *     reportado, abre disputa y se le devuelve.
 *
 *   • Contra entrega: desde que RESERVA, sin haber pagado todavía la comisión.
 *     Aquí el escrow no lo protege igual —Colbisnes solo llega a retener la
 *     comisión, no el valor del equipo, que se paga en efectivo al mensajero—,
 *     así que tiene que poder consultar el SRTM antes de soltar un peso. Si
 *     esperáramos a la comisión confirmada, descubrir que el equipo está
 *     reportado ya le habría costado plata.
 *
 * Reservar no es gratis en el sentido que importa: exige identidad verificada,
 * correo verificado, anti-phishing y datos de cobro, y deja la publicación
 * bloqueada 24 horas en exclusiva (una sola orden activa por producto). Recoger
 * IMEIs así obligaría a bloquear publicaciones ajenas una por una, a la vista
 * del vendedor y con el nombre propio en el registro de auditoría.
 *
 * Se comprueba en el servidor (es el candado de verdad) y en el cliente, que solo
 * lo usa para decidir si dibuja el botón o el aviso de "todavía no".
 */
export function ordenHabilitaVerImei(
  orden: { estado?: string | null; metodoPago?: string | null } | null | undefined
): boolean {
  if (!orden?.estado) return false;
  if ((ESTADOS_CON_PLATA_MOVIDA as readonly string[]).includes(orden.estado)) return true;
  return orden.metodoPago === "CONTRA_ENTREGA" && orden.estado === ESTADO_RESERVA_CONTRA_ENTREGA;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Salud de batería
// ─────────────────────────────────────────────────────────────────────────────

export const SALUD_BATERIA_MIN = 1;
export const SALUD_BATERIA_MAX = 100;

export function normalizarSaludBateria(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = typeof valor === "number" ? valor : parseInt(String(valor).replace(/\D/g, ""), 10);
  if (!Number.isFinite(n)) return null;
  if (n < SALUD_BATERIA_MIN || n > SALUD_BATERIA_MAX) return null;
  return Math.round(n);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Piezas reemplazadas
// ─────────────────────────────────────────────────────────────────────────────

// Vocabulario cerrado a propósito. Si fuera texto libre no se podría filtrar ni
// comparar, y además sería otro sitio por donde meter un teléfono de contacto.
export const PIEZAS = [
  { id: "NINGUNA", label: "Ninguna, todo original" },
  { id: "PANTALLA", label: "Pantalla" },
  { id: "BATERIA", label: "Batería" },
  { id: "CAMARA", label: "Cámara" },
  { id: "PUERTO", label: "Puerto de carga" },
  { id: "CARCASA", label: "Carcasa o tapa" },
  { id: "PLACA", label: "Placa (tarjeta madre)" },
] as const;

export type PiezaId = (typeof PIEZAS)[number]["id"];

const IDS_PIEZAS = new Set<string>(PIEZAS.map((p) => p.id));

/**
 * Deja las piezas como una cadena de tokens separados por coma, o null.
 * Se guarda así —y no como array de Postgres— porque el esquema no usa arrays en
 * ninguna otra parte y no vale la pena estrenar el tipo cuatro días antes de abrir.
 *
 * "NINGUNA" es excluyente: si viene junto a otras, gana la lista de piezas, porque
 * decir "ninguna, y además cambié la pantalla" es una contradicción y lo honesto
 * es quedarse con la información que perjudica al vendedor, no con la que lo favorece.
 */
export function normalizarPiezas(valor: unknown): string | null {
  const bruto: string[] = Array.isArray(valor)
    ? valor.map(String)
    : typeof valor === "string" && valor.trim() !== ""
      ? valor.split(",")
      : [];

  const limpias = [...new Set(bruto.map((p) => p.trim().toUpperCase()))].filter((p) =>
    IDS_PIEZAS.has(p)
  );
  if (limpias.length === 0) return null;

  const reales = limpias.filter((p) => p !== "NINGUNA");
  if (reales.length > 0) return reales.join(",");
  return "NINGUNA";
}

export function piezasALista(valor: string | null | undefined): string[] {
  if (!valor) return [];
  return valor
    .split(",")
    .map((p) => p.trim())
    .filter((p) => IDS_PIEZAS.has(p));
}

export function etiquetaPieza(id: string): string {
  return PIEZAS.find((p) => p.id === id)?.label ?? id;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Condición de devolución por información falsa
// ─────────────────────────────────────────────────────────────────────────────

// Este es el texto que se le muestra al comprador antes de pagar y el que queda
// guardado junto a su aceptación (ver /api/products/[id]/aceptar-garantia).
//
// Vive aquí y no dentro del archivo de ruta por dos razones: un `route.ts` de Next
// solo admite exportar sus handlers y unas pocas opciones —exportar cualquier otra
// cosa rompe el build—, y además así lo puede leer también la pantalla del checkout.
//
// OJO al cambiarlo: la constancia de las compras viejas tiene que seguir diciendo
// lo que el comprador aceptó ESE día. Si el texto cambia, se sube la versión y se
// deja la anterior; no se reescribe la historia.
export const VERSION_GARANTIA = "2026-08-08";
export const TEXTO_GARANTIA =
  "Los datos del dispositivo (IMEI, salud de la batería y piezas reemplazadas) los declara el vendedor. " +
  "Colbisnes no los verifica. Si al recibir el producto la información no corresponde con lo publicado, " +
  "el comprador puede devolverlo por información falsa suministrada y el dinero en custodia se le devuelve.";

// ─────────────────────────────────────────────────────────────────────────────
// 6. Piso de precio por categoría (anti-anzuelo)
// ─────────────────────────────────────────────────────────────────────────────

// El problema que resuelve: publicar un carro en $1 para que la gente escriba
// "¿cuánto vale de verdad?" y así darle un precio distinto a cada uno por chat,
// fuera de toda constancia. En Colbisnes el precio publicado es el que se paga y
// el que queda en custodia, así que un precio falso no es una exageración de
// marketing: rompe el mecanismo de protección.
//
// Es una defensa BASTA y hay que saberlo: no impide publicar un carro en
// $600.000, solo impide el caso absurdo. La defensa fina de verdad es que el
// contacto por fuera ya está filtrado en el chat (lib/contactFilter.ts) y que
// negociar a la baja tiene su propio camino con constancia: las ofertas.
//
// Cualquier categoría que no esté aquí usa PISO_POR_DEFECTO.
export const PISO_POR_DEFECTO = 1_000;

export const PISOS_DE_PRECIO: Record<string, number> = {
  Vehiculos: 500_000,
  Inmuebles: 1_000_000,
  Tecnologia: 10_000,
};

export const TECHO_DE_PRECIO = 1_000_000_000;

export function pisoDePrecio(categoria: unknown): number {
  if (typeof categoria !== "string") return PISO_POR_DEFECTO;
  return PISOS_DE_PRECIO[categoria] ?? PISO_POR_DEFECTO;
}

const formatoCOP = (n: number) => "$" + n.toLocaleString("es-CO");

/**
 * El mensaje de error dice qué hacer, no solo que está mal. Un piso que rechaza
 * sin explicar es una pared: alguien que vende un repuesto de carro en $80.000 se
 * topa con él y se va sin publicar. Nombrando la salida ("va en Otros"), la
 * fricción se puede sortear sin abrirle la puerta al anzuelo.
 */
export function mensajePisoDePrecio(categoria: unknown, piso: number): string {
  const base = `En ${typeof categoria === "string" ? categoria : "esta categoría"} el precio mínimo es ${formatoCOP(piso)}.`;
  if (piso === PISO_POR_DEFECTO) return base;
  return `${base} Si estás vendiendo un repuesto o un accesorio, publícalo en la categoría "Otros". El precio que publicas es el que se cobra y queda en custodia, por eso no puede ser un precio de gancho.`;
}
