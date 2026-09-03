// Validación de la llave Bre-B.
//
// Por qué existe este archivo (2026-09-02): la casilla del perfil filtraba a solo
// dígitos al teclear. Una llave Bre-B NO es siempre un número — el Banco de la
// República define CUATRO formas y solo una es numérica pura:
//
//   · celular ......... 3001234567
//   · correo .......... juan@gmail.com
//   · documento ....... 1020304050
//   · alfanumérica .... @juanperez
//
// O sea que la mitad de la gente no podía escribir la suya. Y lo peor no era el
// bloqueo sino el silencio: al pegar "@juanperez" el filtro borraba todo y la
// casilla se quedaba vacía, sin un solo mensaje que dijera por qué. Quien no
// entiende qué hizo mal no lo reintenta, deja el campo en blanco — y sin llave
// Bre-B no puede vender (ver lib/requirePayoutInfo.ts).
//
// El servidor tampoco miraba nada: PATCH /api/user copiaba `brebId` del cuerpo tal
// cual. La pantalla se puede saltar llamando al endpoint directo, así que la regla
// vive aquí y la repiten los dos lados, igual que con la dirección de envío.
//
// Criterio a propósito FLOJO, por la misma razón que en lib/direccion.ts: esto es a
// dónde le llega la plata al vendedor, pero Colbisnes no tiene forma de consultar el
// directorio Bre-B para saber si una llave existe. Quien la escriba mal se entera
// cuando no le llega su pago; quien quede bloqueado por una regla demasiado estricta
// no puede ni terminar su perfil. Aquí solo se atajan las cosas que con seguridad
// NO son una llave.

export const LARGO_MAX_BREB = 60;

/** Largo mínimo. Una llave alfanumérica corta como "@ana" son 4 caracteres. */
const LARGO_MIN_BREB = 4;

export interface ValidacionBreb {
  valido: boolean;
  motivo?: string;
}

/**
 * Quita solo los espacios y recorta. NO borra caracteres: si algo no sirve, se dice
 * con un mensaje en vez de hacerlo desaparecer de la casilla mientras la persona
 * escribe. Los espacios sí se van en silencio porque nunca son parte de una llave y
 * casi siempre entran pegando texto de otro lado.
 */
export function limpiarBreb(texto: string): string {
  return texto.replace(/\s/g, "").slice(0, LARGO_MAX_BREB);
}

/**
 * Revisa una llave Bre-B.
 *
 * El vacío se considera VÁLIDO: quien todavía no la tiene debe poder guardar el resto
 * de su perfil. Lo que bloquea vender es no tenerla (lib/requirePayoutInfo.ts), y ese
 * aviso ya se da en su momento y con su propio mensaje.
 */
export function validarBreb(llave: string | null | undefined): ValidacionBreb {
  const v = (llave || "").trim();

  if (!v) return { valido: true };

  if (v.length > LARGO_MAX_BREB) {
    return { valido: false, motivo: `La llave Bre-B no puede pasar de ${LARGO_MAX_BREB} caracteres.` };
  }
  if (v.length < LARGO_MIN_BREB) {
    return { valido: false, motivo: "Esa llave está muy corta. Escríbela como la tienes registrada en tu banco." };
  }

  // Solo se rechaza lo que con seguridad no es una llave: caracteres de control y los
  // que ningún banco acepta en ninguna de las cuatro formas. Se permiten letras con
  // tilde y ñ porque hay correos que las llevan.
  if (!/^[a-zA-Z0-9áéíóúÁÉÍÓÚüÜñÑ@._+\-]+$/.test(v)) {
    return { valido: false, motivo: "La llave Bre-B solo lleva letras, números, arroba, punto o guion." };
  }

  // Un solo carácter repetido ("aaaaaaa", "0000000").
  if (/^(.)\1+$/.test(v)) {
    return { valido: false, motivo: "Esa no parece una llave Bre-B real." };
  }

  return { valido: true };
}
