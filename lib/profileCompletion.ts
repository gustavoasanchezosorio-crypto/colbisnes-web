// Campos que cuentan para el "perfil completo". USDT queda fuera a propósito:
// es opcional, así que un usuario puede llegar al 100% sin usar cripto.
export interface ProfileFields {
  name?: string | null;
  phone?: string | null;
  city?: string | null;
  image?: string | null;
  nequiNumber?: string | null;
  brebId?: string | null;
  phoneWhatsapp?: string | null;
  direccionEnvio?: string | null;
  antiPhishingCode?: string | null;
  kycStatus?: string | null;
}

interface CampoPerfil {
  key: keyof ProfileFields;
  label: string;
  // Campos que el SERVIDOR exige de verdad para mover plata. Se resaltan aparte en los
  // avisos contextuales, así que la lista tiene que calcar lo que bloquean los endpoints
  // — si un campo bloquea y no está marcado aquí, el usuario se entera cuando ya se
  // estrelló contra un 403, que es exactamente lo que pasaba con el código anti fraude.
  //
  // Quién exige qué, a día de hoy (verificado abriendo cada ruta, no buscando el nombre
  // del ayudante requireKyc: publicar hace la comprobación a mano y no lo usa):
  //   · publicar (POST /api/products) ....... KYC + código anti fraude
  //   · hacer una oferta (POST /api/offers) . KYC + código anti fraude
  //   · pagar (los 3 checkouts) ............. KYC + código anti fraude + Nequi + Bre-B
  //   · que te compren (tieneDatosDeCobro) .. Nequi + Bre-B del vendedor
  critico?: boolean;
  // Check personalizado: por defecto "tiene algún valor"; el KYC solo cuenta si está aprobado.
  check?: (v: unknown) => boolean;
}

// Orden = prioridad con la que se le sugiere al usuario completarlos. Los críticos van
// primero y entre ellos manda el orden en que la persona se los va a topar: el código
// anti fraude frena ya en la primera oferta, antes que los datos de cobro.
export const CAMPOS_PERFIL: CampoPerfil[] = [
  { key: "name",            label: "Tu nombre" },
  { key: "kycStatus",       label: "Verificación de identidad (KYC)", critico: true, check: (v) => v === "approved" },
  { key: "antiPhishingCode",label: "Código anti fraude", critico: true },
  { key: "nequiNumber",     label: "Número Nequi", critico: true },
  { key: "brebId",          label: "Llave Bre-B", critico: true },
  { key: "phone",           label: "Teléfono" },
  { key: "phoneWhatsapp",   label: "WhatsApp" },
  { key: "city",            label: "Ciudad" },
  { key: "direccionEnvio",  label: "Dirección de envío" },
  { key: "image",           label: "Foto de perfil" },
];

const lleno = (v: unknown): boolean =>
  typeof v === "string" ? v.trim().length > 0 : !!v;

const campoCompleto = (c: CampoPerfil, v: unknown): boolean =>
  c.check ? c.check(v) : lleno(v);

export interface ProfileCompletion {
  percent: number;          // 0–100
  completos: number;
  total: number;
  faltantes: { key: string; label: string; critico: boolean }[];
  // true si le falta algo CRÍTICO para vender/cobrar (KYC, Nequi o Bre-B).
  faltaCritico: boolean;
  // Desglose de lo crítico faltante, para los avisos contextuales antes de publicar/cobrar.
  faltantesCriticos: { key: string; label: string }[];
}

export function computeProfileCompletion(user: ProfileFields | null | undefined): ProfileCompletion {
  const total = CAMPOS_PERFIL.length;
  const faltantes = CAMPOS_PERFIL
    .filter((c) => !campoCompleto(c, user?.[c.key]))
    .map((c) => ({ key: c.key as string, label: c.label, critico: !!c.critico }));
  const completos = total - faltantes.length;
  const percent = Math.round((completos / total) * 100);
  const faltantesCriticos = faltantes.filter((f) => f.critico).map(({ key, label }) => ({ key, label }));
  return { percent, completos, total, faltantes, faltaCritico: faltantesCriticos.length > 0, faltantesCriticos };
}
