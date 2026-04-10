export const THEME = {
  primary: "#00589F",
  primaryDark: "#003f7a",
  primaryLight: "#4c8cff",
  secondary: "#D4AF37",
  secondaryLight: "#ECE3C7",
  background: "#f5f7fa",
  surface: "#FFFFFF",
  text: "#1e2b3c",
  muted: "#64748B",
  border: "#eef2f6",
  success: "#10B981",
  error: "#EF4444",
  warning: "#F59E0B",
} as const;

export const PRODUCT_STATUS = {
  AVAILABLE: "AVAILABLE",
  PAYMENT_PENDING: "PAYMENT_PENDING",
  IN_ESCROW: "IN_ESCROW",
  SOLD: "SOLD",
} as const;

export const OFFER_STATUS = {
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
} as const;

export const CITIES = ["Bogotá", "Medellín", "Cali", "Barranquilla", "Cartagena"] as const;
