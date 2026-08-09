// Validación de la dirección de envío.
//
// Por qué existe este archivo: el campo aceptaba cualquier cosa. La pantalla de perfil
// filtraba unos caracteres al teclear y el endpoint PATCH /api/user guardaba el texto tal
// cual, sin mirarlo. Resultado: se podía dejar un correo de dirección — el filtro borraba
// la arroba en silencio y "gustavo@gmail.com" quedaba guardado como "gustavogmail.com",
// que pasa por dirección sin serlo. Un paquete despachado a eso no llega a ninguna parte.
//
// La regla vive AQUÍ y la usan las dos partes, para que no se vuelvan a separar. El
// servidor es el que manda: la pantalla puede saltarse (basta con llamar al endpoint
// directo), así que la misma comprobación se repite allá.
//
// Criterio a propósito FLOJO. Una dirección colombiana de verdad puede ser
// "Calle 123 #45-67 Apto 302" pero también "Vereda La Cabaña, finca El Recreo" o
// "Frente al parque principal". No se exige un formato ni que lleve números: rechazar
// a alguien del campo que sí puso su dirección real es peor que dejar pasar una
// dirección pobre, porque el que la escribió mal se entera cuando no le llega el
// paquete, pero el que quedó bloqueado no puede ni terminar su perfil. Aquí solo se
// atajan las cosas que con seguridad NO son una dirección.

export interface ValidacionDireccion {
  valido: boolean;
  motivo?: string;
}

/** Dominios de correo que la gente escribe por error en el campo de dirección. */
const DOMINIOS_CORREO = /\b(gmail|hotmail|outlook|yahoo|icloud|protonmail|live|msn)\b/i;

/** Largo mínimo. "Cra 7 # 1-2" son 11 caracteres, así que 10 no deja fuera nada real. */
const LARGO_MINIMO = 10;

export const DIRECCION_LARGO_MAXIMO = 200;

/**
 * Caracteres que se dejan escribir. Se permite la arroba a propósito, aunque una
 * dirección no la lleve: si se borrara al teclear, el que escribe su correo ve
 * desaparecer letras sin explicación y no entiende qué hizo mal. Mejor dejarlo escribir
 * y decirle con todas las letras que eso es un correo, no una dirección.
 */
export function limpiarDireccion(texto: string): string {
  return texto.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚüÜñÑ\s\-.,#@]/g, "").slice(0, DIRECCION_LARGO_MAXIMO);
}

/**
 * Revisa una dirección de envío.
 *
 * El vacío se considera VÁLIDO: el campo es opcional y quien todavía no la tiene debe
 * poder guardar el resto de su perfil. Lo que no se acepta es algo escrito que no sea
 * una dirección.
 */
export function validarDireccionEnvio(direccion: string | null | undefined): ValidacionDireccion {
  const dir = (direccion || "").trim();

  // Campo opcional: sin dirección no hay nada que revisar.
  if (!dir) return { valido: true };

  if (dir.length > DIRECCION_LARGO_MAXIMO) {
    return { valido: false, motivo: `La dirección no puede pasar de ${DIRECCION_LARGO_MAXIMO} caracteres.` };
  }

  if (dir.includes("@") || DOMINIOS_CORREO.test(dir)) {
    return { valido: false, motivo: "Eso parece un correo, no una dirección. Escribe dónde te llega el paquete (ej: Calle 123 #45-67, Barrio, Ciudad)." };
  }

  if (/^(https?:\/\/|www\.)/i.test(dir) || /\.(com|co|net|org|es|io)\b/i.test(dir)) {
    return { valido: false, motivo: "Eso parece una página web, no una dirección. Escribe dónde te llega el paquete." };
  }

  if (dir.length < LARGO_MINIMO) {
    return { valido: false, motivo: "La dirección está muy corta. Incluye la calle o vereda, el número y el barrio o ciudad." };
  }

  // Una dirección real siempre tiene más de una palabra. Esto ataja de una los pegotes
  // sin espacios tipo "gustavogmail.com" o "asdfasdfasdf" que no cayeron arriba.
  if (!/\s/.test(dir)) {
    return { valido: false, motivo: "Falta información. Escribe la dirección completa, con el barrio o la ciudad (ej: Calle 123 #45-67, Chapinero, Bogotá)." };
  }

  // Un solo carácter repetido ("aaaaaaaaaa", "..........").
  if (/^(.)\1+$/.test(dir.replace(/\s/g, ""))) {
    return { valido: false, motivo: "Esa no parece una dirección real." };
  }

  return { valido: true };
}
