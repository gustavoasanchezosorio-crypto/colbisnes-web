import { PRODUCT_STATUS, OFFER_STATUS, THEME } from './theme';

export const formatMoney = (n: number): string =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);

export const getTimeLeft = (exp: string | number | null | undefined): string | null => {
  if (!exp) return null;
  const expMs = typeof exp === "string" ? new Date(exp).getTime() : exp;
  if (isNaN(expMs)) return null;
  const diff = expMs - Date.now();
  if (diff <= 0) return "00:00";
  const m = Math.floor(diff / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

export const getStatusLabel = (status?: string): string => {
  const labels: Record<string, string> = {
    [PRODUCT_STATUS.AVAILABLE]: "DISPONIBLE",
    [PRODUCT_STATUS.PAYMENT_PENDING]: "PAGO EN PROCESO",
    [PRODUCT_STATUS.IN_ESCROW]: "EN CUSTODIA",
    [PRODUCT_STATUS.SOLD]: "VENDIDO",
  };
  return labels[status || ""] || "DISPONIBLE";
};

export const getOfferStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    [OFFER_STATUS.PENDING]: "PENDIENTE",
    [OFFER_STATUS.ACCEPTED]: "ACEPTADA",
    [OFFER_STATUS.REJECTED]: "RECHAZADA",
  };
  return labels[status] || status;
};

export const getOfferStatusColor = (status: string): string => {
  const colors: Record<string, string> = {
    [OFFER_STATUS.PENDING]: THEME.secondary,
    [OFFER_STATUS.ACCEPTED]: THEME.success,
    [OFFER_STATUS.REJECTED]: THEME.error,
  };
  return colors[status] || THEME.muted;
};
