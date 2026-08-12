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

// Ciudades donde se puede publicar. Es una lista CERRADA a propósito: el filtro
// "buscar por ciudad" de la portada agrupa por este texto exacto, así que si cada
// quien escribiera la suya a mano acabaríamos con "Bogota", "bogotá" y "Bogotá D.C."
// como tres ciudades distintas y el filtro dejaría de servir.
//
// Hasta el 2026-08-12 aquí solo había CINCO ciudades (Bogotá, Medellín, Cali,
// Barranquilla y Cartagena). Eso dejaba fuera a media Colombia — alguien en Ibagué
// no podía publicar, y ni siquiera escribiendo la ciudad a mano, porque el esquema
// de utils/validations.ts valida contra esta misma lista. Ahora están las 32
// capitales de departamento más los municipios más poblados del país.
//
// Van en orden alfabético y no por tamaño: en el desplegable del móvil se busca
// tecleando la primera letra, y eso solo funciona si la lista está ordenada.
//
// Si añades una ciudad: escríbela con su tilde y en su sitio alfabético. Y NUNCA
// borres ni renombres una que ya esté, porque hay publicaciones guardadas con ese
// texto exacto y la pantalla de editar (app/product/[id]/editar) cambia la ciudad
// a "Bogotá" en silencio si no encuentra la que traía el producto.
export const CITIES = [
  "Acacías", "Aguachica", "Aguazul", "Apartadó", "Arauca", "Arjona", "Armenia",
  "Barrancabermeja", "Barranquilla", "Bello", "Bogotá", "Bucaramanga", "Buenaventura", "Buga",
  "Cajicá", "Calarcá", "Cali", "Candelaria", "Cartagena", "Cartago", "Caucasia", "Cereté",
  "Chía", "Chinchiná", "Chiquinquirá", "Ciénaga", "Copacabana", "Corozal", "Cota", "Cúcuta",
  "Dosquebradas", "Duitama",
  "El Banco", "El Carmen de Bolívar", "Envigado", "Espinal",
  "Facatativá", "Florencia", "Floridablanca", "Funza", "Fusagasugá",
  "Garzón", "Girardot", "Girón", "Granada",
  "Honda",
  "Ibagué", "Inírida", "Ipiales", "Itagüí",
  "Jamundí",
  "La Dorada", "La Estrella", "La Tebaida", "Leticia", "Lorica", "Los Patios",
  "Madrid", "Magangué", "Maicao", "Malambo", "Manizales", "Medellín", "Melgar", "Mitú",
  "Mocoa", "Montelíbano", "Montería", "Mosquera",
  "Neiva",
  "Ocaña",
  "Paipa", "Palmira", "Pamplona", "Pasto", "Pereira", "Piedecuesta", "Pitalito",
  "Planeta Rica", "Popayán", "Puerto Asís", "Puerto Carreño", "Puerto Tejada",
  "Quibdó", "Quimbaya",
  "Riohacha", "Rionegro",
  "Sabaneta", "Sahagún", "San Andrés", "San Gil", "San José del Guaviare", "Santa Marta",
  "Santa Rosa de Cabal", "Santander de Quilichao", "Sincelejo", "Soacha", "Sogamoso", "Soledad",
  "Tuluá", "Tumaco", "Tunja", "Turbaco", "Turbo",
  "Ubaté", "Uribia",
  "Valledupar", "Villa del Rosario", "Villamaría", "Villavicencio",
  "Yopal", "Yumbo",
  "Zipaquirá",
] as const;

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
