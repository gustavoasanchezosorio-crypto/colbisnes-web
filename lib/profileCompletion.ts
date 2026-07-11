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
}

interface CampoPerfil {
  key: keyof ProfileFields;
  label: string;
}

// Orden = prioridad con la que se le sugiere al usuario completarlos.
export const CAMPOS_PERFIL: CampoPerfil[] = [
  { key: "name",            label: "Tu nombre" },
  { key: "nequiNumber",     label: "Número Nequi" },
  { key: "brebId",          label: "Llave BreB" },
  { key: "phone",           label: "Teléfono" },
  { key: "phoneWhatsapp",   label: "WhatsApp" },
  { key: "city",            label: "Ciudad" },
  { key: "direccionEnvio",  label: "Dirección de envío" },
  { key: "image",           label: "Foto de perfil" },
  { key: "antiPhishingCode",label: "Código anti-phishing" },
];

const lleno = (v: unknown): boolean =>
  typeof v === "string" ? v.trim().length > 0 : !!v;

export interface ProfileCompletion {
  percent: number;          // 0–100
  completos: number;
  total: number;
  faltantes: { key: string; label: string }[];
}

export function computeProfileCompletion(user: ProfileFields | null | undefined): ProfileCompletion {
  const total = CAMPOS_PERFIL.length;
  const faltantes = CAMPOS_PERFIL.filter((c) => !lleno(user?.[c.key]));
  const completos = total - faltantes.length;
  const percent = Math.round((completos / total) * 100);
  return { percent, completos, total, faltantes };
}
