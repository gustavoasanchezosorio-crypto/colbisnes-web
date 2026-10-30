// Lista de ciudades principales de Colombia para el selector de "ciudad de destino"
// del comprador (perfil y checkout) y como referencia de la ciudad del vendedor
// (Product.city, que ya era texto libre desde antes).
//
// NO es la lista completa de los ~1.100 municipios de Colombia (DIVIPOLA) — eso queda
// pendiente para una fase futura con autocompletado. Por ahora cubre las capitales de
// departamento y las principales ciudades de cada área metropolitana, que es donde
// vive la gran mayoría de compradores reales de Colbisnes. Si alguien vive en un
// municipio que no está aquí, por ahora escoge la capital de su departamento como
// aproximación — eso solo afecta a qué ZONA (LOCAL/NACIONAL) cae en
// lib/tarifasEnvio.ts, nunca bloquea la compra en sí.
//
// Por qué existe este archivo (2026-10-29): antes de esto no había ningún campo
// confiable de "a qué ciudad va este paquete" — ver el comentario largo en
// User.ciudadDestino (prisma/schema.prisma). El checkout cobraba $0 de envío sin que
// nadie se enterara (incidente del café Bogotá→Medellín, 2026-10-27).
export const CIUDADES_PRINCIPALES = [
  "Bogotá",
  "Medellín",
  "Cali",
  "Barranquilla",
  "Cartagena",
  "Cúcuta",
  "Bucaramanga",
  "Pereira",
  "Santa Marta",
  "Ibagué",
  "Pasto",
  "Manizales",
  "Neiva",
  "Villavicencio",
  "Armenia",
  "Valledupar",
  "Montería",
  "Sincelejo",
  "Popayán",
  "Tunja",
  "Florencia",
  "Riohacha",
  "Yopal",
  "Quibdó",
  "Mocoa",
  "San Andrés",
  "Leticia",
  "Arauca",
  "Inírida",
  "Mitú",
  "Puerto Carreño",
  // Área metropolitana de Bogotá, Medellín, Barranquilla y Pereira: lo bastante
  // grandes y distintas de su capital como para listarlas aparte.
  "Soacha",
  "Bello",
  "Itagüí",
  "Envigado",
  "Soledad",
  "Dosquebradas",
] as const;

export type CiudadPrincipal = (typeof CIUDADES_PRINCIPALES)[number];

/** Normaliza para comparar ciudades: sin tildes, minúsculas, sin espacios de sobra. */
export function normalizarCiudad(ciudad: string | null | undefined): string {
  return (ciudad || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // quita tildes (diacríticos combinantes tras NFD)
}

/**
 * true si dos nombres de ciudad son "la misma" para efectos de zona LOCAL/NACIONAL
 * en lib/tarifasEnvio.ts. Comparación por texto normalizado, no por un id de ciudad
 * (no existe tal id en el modelo de datos hoy) — "Bogotá" y "bogota" cuentan igual,
 * "Bogotá" y "Soacha" no, aunque sean área metropolitana.
 */
export function mismaCiudad(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizarCiudad(a);
  const nb = normalizarCiudad(b);
  if (!na || !nb) return false;
  return na === nb;
}
