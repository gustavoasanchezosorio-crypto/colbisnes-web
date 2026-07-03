// Validación de formato de números de guía por transportadora colombiana.
// No sustituye una integración de tracking en tiempo real (esas transportadoras no
// ofrecen APIs públicas de auto-servicio), pero evita que se registren guías vacías,
// demasiado cortas o con caracteres inválidos — un patrón común en fraude de "envío falso".

export interface ValidacionGuia {
  valido: boolean;
  motivo?: string;
}

const PATRONES: Record<string, RegExp> = {
  "Servientrega":     /^[0-9]{9,12}$/,
  "Coordinadora":     /^[0-9]{8,12}$/,
  "Interrapidisimo":  /^[0-9]{8,13}$/,
  "TCC":              /^[0-9A-Za-z]{8,15}$/,
  "Envia":            /^[0-9]{8,14}$/,
  "La Ultima Milla":  /^[0-9A-Za-z]{6,15}$/,
  "Otra":             /^[0-9A-Za-z-]{5,20}$/,
};

export function validarNumeroGuia(transportadora: string, numeroGuia: string): ValidacionGuia {
  const guia = (numeroGuia || "").trim();

  if (!guia) return { valido: false, motivo: "El número de guía no puede estar vacío" };
  if (guia.length < 5) return { valido: false, motivo: "El número de guía es demasiado corto para ser válido" };

  // Rechaza patrones obvios de relleno/fraude: todos los mismos dígitos, secuencias triviales
  if (/^(.)\1+$/.test(guia)) return { valido: false, motivo: "El número de guía no parece válido (dígitos repetidos)" };
  if (/^(0123456789|1234567890|00000000)/.test(guia)) {
    return { valido: false, motivo: "El número de guía no parece válido" };
  }

  const patron = PATRONES[transportadora] || PATRONES["Otra"];
  if (!patron.test(guia)) {
    return { valido: false, motivo: `El formato del número de guía no coincide con lo esperado para ${transportadora}` };
  }

  return { valido: true };
}
