export const THEME = {
  primary: "#0e56c0",
  primaryDark: "#0a2e6b",
  primaryLight: "#2fa4dc",
  secondary: "#D4AF37",
  secondaryLight: "#ECE3C7",
  // ── Tema claro "recuadro Colbisnes": blanco + borde azul metalizado + texto oscuro ──
  background: "#eef2f7",                                        // fondo página: gris-azulado muy claro
  surface: "#FFFFFF",                                          // fondo sólido de recuadro
  // recuadro blanco con rim de azul metalizado (truco border-box: exige border transparente)
  surfaceGradient: "linear-gradient(#ffffff,#ffffff) padding-box, linear-gradient(140deg,#5ccbf2 0%,#26a0e0 20%,#1466cc 46%,#0c47a3 70%,#0a2e6b 100%) border-box",
  surfaceAlt: "#eef3fb",                                      // relleno sutil azul muy claro
  text: "#0d1b2a",                                            // texto principal oscuro
  textSoft: "#33465c",                                        // texto secundario
  muted: "#64748B",                                           // texto tenue
  gold: "#C79A2E",                                            // dorado legible sobre blanco (detalle)
  goldSoft: "rgba(199,154,46,0.5)",
  border: "#d6e2f1",                                          // borde/divisor suave azul acero
  metalBorder: "linear-gradient(140deg,#5ccbf2 0%,#26a0e0 20%,#1466cc 46%,#0c47a3 70%,#0a2e6b 100%)", // azul metalizado candy (cian→cobalto→marino)
  cardShadow: "0 12px 30px rgba(0,63,122,0.13), inset 0 1px 0 rgba(255,255,255,0.9)", // sombra + brillo superior
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

export const CATEGORIES = [
  { id: "Vehiculos", label: "Vehiculos", icon: "🚗" },
  { id: "Inmuebles", label: "Inmuebles", icon: "🏠" },
  { id: "Tecnologia", label: "Tecnologia", icon: "📱" },
  { id: "Hogar", label: "Hogar y jardin", icon: "🛋️" },
  { id: "Moda", label: "Moda y accesorios", icon: "👕" },
  { id: "Mascotas", label: "Mascotas", icon: "🐾" },
  { id: "Ninos", label: "Ninos y bebes", icon: "🍼" },
  { id: "Deportes", label: "Deportes", icon: "⚽" },
  { id: "Empleo", label: "Empleo", icon: "💼" },
  { id: "Servicios", label: "Servicios", icon: "🛠️" },
  { id: "Otros", label: "Otros", icon: "📦" },
];
