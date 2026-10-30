import { PESOS_PRODUCTO, type PesoProducto } from "@/lib/entrega";
import { mismaCiudad } from "@/lib/ciudades";

/**
 * Tarifa de envío de RESPALDO en COP. Se usa SOLO cuando el vendedor no fijó su
 * propio `precioEnvio` (ver `calcularExtrasCheckout` en lib/pricing.ts) — si el
 * vendedor puso un precio, este archivo ni se consulta.
 *
 * Números de referencia PÚBLICA, no tarifas negociadas con ninguna transportadora:
 * consultados el 2026-10-29 en las páginas de tarifas publicadas de Interrapidísimo
 * y Servientrega para paquetería estándar sin seguro adicional, redondeados a un
 * número conservador (ligeramente por encima del promedio visto) para no dejar al
 * vendedor pagando de su bolsillo si la tarifa real resulta un poco más cara. Hay
 * que recalibrar esto en cuanto exista un contrato real con una transportadora —
 * ver la nota sobre la falta de API de cotización en tiempo real en lib/pricing.ts.
 *
 * Dos zonas porque hoy no existe departamento/región en el modelo de datos, solo
 * ciudad (Product.city, User/Order.ciudadDestino): LOCAL = misma ciudad (comparación
 * normalizada, ver lib/ciudades.ts), NACIONAL = cualquier otro caso, sin distinguir
 * "cerca" de "lejos" dentro de "nacional" (Bogotá→Chía y Bogotá→Leticia cuestan lo
 * mismo aquí, aunque en la realidad no sea así — simplificación deliberada de MVP).
 */
const TARIFAS_COP: Record<"LOCAL" | "NACIONAL", Record<PesoProducto, number | null>> = {
  LOCAL: {
    MENOS_1KG: 8_000,
    DE_1_A_5KG: 12_000,
    DE_5_A_20KG: 18_000,
    // Sin tarifa estándar de mensajería local para esto — un bulto de más de 20 kg
    // dentro de la misma ciudad normalmente se coordina aparte (flete, no mensajería).
    MAS_20KG: null,
  },
  NACIONAL: {
    MENOS_1KG: 13_000,
    DE_1_A_5KG: 20_000,
    DE_5_A_20KG: 35_000,
    // Fuera del rango de paquetería estándar de las transportadoras nacionales —
    // necesita cotización de carga aparte, no hay un número de referencia confiable.
    MAS_20KG: null,
  },
};

/**
 * Calcula la tarifa de envío de respaldo, o `null` si no se puede determinar.
 *
 * Nunca devuelve 0: si falta un dato (ciudad de destino, peso, o el peso cae en un
 * rango sin tarifa estándar) la respuesta es "no se sabe", nunca "gratis". Antes de
 * este archivo, justo esa ambigüedad —faltaba el dato, así que se cobraba $0 sin
 * avisar— fue el incidente que lo originó (ver prisma/schema.prisma, User.ciudadDestino).
 */
export function calcularTarifaEnvioDefault(
  ciudadVendedor: string | null | undefined,
  ciudadDestino: string | null | undefined,
  pesoAprox: string | null | undefined
): number | null {
  if (!ciudadDestino || !pesoAprox) return null;
  if (!(PESOS_PRODUCTO as readonly string[]).includes(pesoAprox)) return null;

  const zona = mismaCiudad(ciudadVendedor, ciudadDestino) ? "LOCAL" : "NACIONAL";
  return TARIFAS_COP[zona][pesoAprox as PesoProducto];
}
