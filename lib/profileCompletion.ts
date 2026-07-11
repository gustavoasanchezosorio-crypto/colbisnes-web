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
  // Campos críticos para poder VENDER y RECIBIR pagos (KYC + datos de cobro).
  // Se resaltan aparte en los avisos contextuales.
  critico?: boolean;
  // Check personalizado: por defecto "tiene algún valor"; el KYC solo cuenta si está aprobado.
  check?: (v: unknown) => boolean;
}

// Orden = prioridad con la que se le sugiere al usuario completarlos.
export const CAMPOS_PERFIL: CampoPerfil[] = [
  { key: "name",            label: "Tu nombre" },
  { key: "kycStatus",       label: "Verificación de identidad (KYC)", critico: true, check: (v) => v === "approved" },
  { key: "nequiNumber",     label: "Número Nequi", critico: true },
  { key: "brebId",          label: "Llave Bre-B", critico: true },
  { key: "phone",           label: "Teléfono" },
  { key: "phoneWhatsapp",   label: "WhatsApp" },
  { key: "city",            label: "Ciudad" },
  { key: "direccionEnvio",  label: "Dirección de envío" },
  { key: "image",           label: "Foto de perfil" },
  { key: "antiPhishingCode",label: "Código anti-phishing" },
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
