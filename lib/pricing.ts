export const WOMPI_PCT            = 0.0265;
export const WOMPI_FIXED          = 700;
export const WOMPI_IVA            = 0.19;
export const GMF_PCT              = 0.004;
export const COLBISNES_PCT_ONLINE = 0.10; // 10% comisión Colbisnes sobre ventas online (Wompi)
export const COLBISNES_PCT_CE     = 0.03; // 3%  comisión Colbisnes sobre contra entrega
export const TEST_MODE            = process.env.NEXT_PUBLIC_TEST_MODE === "true";
// Wompi/Nequi rechaza cualquier transacción por debajo de este monto ("El monto mínimo de una
// transacción es $1,500"). Se usa como piso del cobro por Nequi (comisión de reserva) y como
// monto en modo pruebas. Si la comisión calculada queda por debajo, se sube a este mínimo.
export const WOMPI_MIN_TX_COP     = 1500;
export const TEST_AMOUNT          = WOMPI_MIN_TX_COP; // mínimo que acepta Nequi para pruebas reales

// Listados destacados: el vendedor paga para que su producto aparezca primero en home/búsqueda
export const DESTACADO_PRECIO = 8000;   // COP
export const DESTACADO_DIAS   = 7;

// Protección de compra extendida: add-on opcional del comprador en el checkout
export const PROTECCION_EXTENDIDA_PRECIO = 3000; // COP

// Margen de Colbisnes sobre el costo de envío declarado por el vendedor (producto.precioEnvio)
export const MARGEN_ENVIO_PCT = 0.10; // 10%

// Descuento sobre el % de comisión según el nivel de confianza del VENDEDOR.
// Objetivo: darle a los vendedores con buen historial una razón concreta para seguir
// vendiendo dentro de Colbisnes (comisión más baja) en vez de migrar la relación con
// sus compradores hacia fuera de la app. Como la comisión la paga el comprador
// (se suma al precio), el descuento también baja el total que paga el comprador —
// comprarle a un vendedor de alto nivel sale un poco más barato.
export const DESCUENTO_COMISION_POR_NIVEL: Record<string, number> = {
  "Nuevo": 0,
  "Básico": 0,
  "Confiable": 0.10,       // -10% sobre la comisión
  "Muy confiable": 0.20,   // -20% sobre la comisión
  "Élite": 0.30,           // -30% sobre la comisión
};

export function multiplicadorPorNivel(nivelVendedor?: string | null): number {
  if (!nivelVendedor) return 1;
  const descuento = DESCUENTO_COMISION_POR_NIVEL[nivelVendedor] ?? 0;
  return 1 - descuento;
}

/**
 * El nivel que cuenta PARA EL DESCUENTO, que no siempre es el nivel que se muestra.
 *
 * Por qué existe (2026-09-02): solo con abrir cuenta (20 pts) y verificar identidad (30 pts)
 * ya se llegaba a 50, que es "Confiable" y −10% de comisión. Resultado real en producción:
 * 16 de 17 usuarios tenían descuento y NINGUNO había cerrado un solo negocio. El descuento
 * existe para premiar a quien ya vendió aquí y no se llevó la relación por fuera; darlo de
 * entrada no premia nada, solo regala margen. Y el checkout le decía al comprador
 * "comisión reducida por buen historial" sobre alguien sin historial: era falso.
 *
 * Regla: sin al menos un negocio cerrado no hay descuento, tenga el nivel que tenga. El
 * nivel y el sello de verificado se siguen mostrando igual; lo único que se aplaza es la
 * plata. Al primer negocio completado el descuento entra solo, sin que nadie haga nada.
 */
export function nivelParaDescuento(
  nivelVendedor: string | null | undefined,
  negociosCerrados: number
): string | null {
  if (!negociosCerrados || negociosCerrados < 1) return null;
  return nivelVendedor ?? null;
}

export interface PricingBreakdown {
  precioBase: number;
  comisionColbisnes: number;
  totalComprador: number;
  costoWompi: number;
  gmf: number;              // GMF de ENTRADA (lo paga el comprador vía gross-up)
  gmfSalida: number;        // GMF de SALIDA (4x1000): lo asume el vendedor al recibir la transferencia
  gananciaColbisnes: number;
  recibeVendedor: number;   // neto real que recibe el vendedor = precioBase − gmfSalida
  testMode: boolean;
}

export interface USDTPricing {
  precioBaseUSD: number;
  comisionUSD: number;
  totalUSD: number;
  wallet: string;
  red: string;
  testMode: boolean;
}

// exento (perfil MASTER, ver lib/adminAuth.ts): salta ÚNICAMENTE la comisión propia de
// Colbisnes, cuando el comprador o el vendedor de la orden es la cuenta master. Wompi/GMF
// siguen cobrándose completos —son costos reales de un tercero, no algo que Colbisnes pueda
// "regalar"— así que el comprador master sigue pagando el mismo costo de pasarela que
// pagaría cualquiera; lo único que desaparece es la ganancia de Colbisnes sobre esa venta.
export function calcularPrecioOnline(precioBase: number, nivelVendedor?: string | null, exento: boolean = false): PricingBreakdown {
  if (TEST_MODE) return { precioBase, comisionColbisnes: 0, totalComprador: TEST_AMOUNT, costoWompi: 0, gmf: 0, gmfSalida: 0, gananciaColbisnes: 0, recibeVendedor: precioBase, testMode: true };
  const comisionColbisnes = exento ? 0 : Math.round(precioBase * COLBISNES_PCT_ONLINE * multiplicadorPorNivel(nivelVendedor));

  // El comprador cubre el costo de Wompi + GMF, además de la comisión de Colbisnes.
  // Como el fee de Wompi es un % del propio total, hay que despejar el total (gross-up):
  //   totalComprador = precioBase + comisión + costoWompi(total) + gmf(total)
  //   costoWompi = (total·WOMPI_PCT + WOMPI_FIXED)·(1+IVA)
  //   gmf        = total·GMF_PCT
  // Resolviendo para total:
  //   total = (precioBase + comisión + WOMPI_FIXED·(1+IVA)) / (1 − WOMPI_PCT·(1+IVA) − GMF_PCT)
  // Así, tras descontar Wompi y GMF, a Colbisnes le queda su comisión íntegra y el
  // vendedor recibe el 100% de su precio. Antes la comisión absorbía el fee de Wompi
  // y en ventas pequeñas (por el $700 fijo) Colbisnes terminaba en pérdida.
  const factorWompiVar = WOMPI_PCT * (1 + WOMPI_IVA);
  const wompiFijoConIva = WOMPI_FIXED * (1 + WOMPI_IVA);
  const denominador     = 1 - factorWompiVar - GMF_PCT;
  const totalComprador  = Math.round((precioBase + comisionColbisnes + wompiFijoConIva) / denominador);

  const wompiBase         = totalComprador * WOMPI_PCT + WOMPI_FIXED;
  const costoWompi        = Math.round(wompiBase * (1 + WOMPI_IVA));
  const gmf               = Math.round(totalComprador * GMF_PCT);
  // Neto real para Colbisnes tras pagarle al vendedor: ≈ comisionColbisnes (±redondeo).
  const gananciaColbisnes = totalComprador - costoWompi - gmf - precioBase;
  // GMF de SALIDA (4x1000): cuando Colbisnes transfiere el pago al vendedor, la cuenta de
  // Colbisnes es debitada el 4x1000. Ese costo lo asume el vendedor: se descuenta de su
  // neto (precioBase − gmfSalida). Se le muestra explícito en la pantalla de la oferta.
  const gmfSalida         = Math.round(precioBase * GMF_PCT);
  return { precioBase, comisionColbisnes, totalComprador, costoWompi, gmf, gmfSalida, gananciaColbisnes, recibeVendedor: precioBase - gmfSalida, testMode: false };
}

// exento: igual que en calcularPrecioOnline, pero acá tiene una consecuencia extra. La
// comisión de contra entrega se cobra por adelantado vía Nequi/Wompi, y Wompi rechaza
// cualquier transacción por debajo de $1.500 — por eso el resto de la función pone un piso
// de WOMPI_MIN_TX_COP. Un comisionColbisnes de $0 literal NO puede cobrarse por Nequi, así
// que cuando exento=true se deja en 0 sin piso a propósito: es la señal que usa
// app/api/checkout/contra-entrega/route.ts para saltarse el cobro de comisión por completo
// (en vez de intentar cobrar $0 y fallar) y confirmar la orden directo, como si el admin ya
// hubiera validado el pago en /api/admin/confirmar-comision-nequi.
export function calcularPrecioContraEntrega(precioBase: number, nivelVendedor?: string | null, exento: boolean = false): PricingBreakdown {
  if (TEST_MODE) return { precioBase, comisionColbisnes: 0, totalComprador: TEST_AMOUNT, costoWompi: 0, gmf: 0, gmfSalida: 0, gananciaColbisnes: 0, recibeVendedor: precioBase, testMode: true };
  // La comisión de reserva se cobra por Nequi (Wompi), que exige un mínimo de $1.500 por transacción.
  // En productos baratos el 3% queda por debajo y el cobro fallaba con "El monto mínimo es $1,500".
  // Piso al mínimo de Wompi para que el pago por Nequi funcione siempre; el monto mostrado, el
  // guardado (comisionReservaCOP) y el cobrado quedan idénticos, así el webhook verifica sin desfase.
  const comisionColbisnes = exento ? 0 : Math.max(WOMPI_MIN_TX_COP, Math.round(precioBase * COLBISNES_PCT_CE * multiplicadorPorNivel(nivelVendedor)));
  const totalComprador    = precioBase + comisionColbisnes;
  // Contra entrega: el comprador paga el producto en efectivo al mensajero, no hay transferencia
  // de Colbisnes al vendedor, así que no aplica GMF de salida — el vendedor recibe el 100%.
  return { precioBase, comisionColbisnes, totalComprador, costoWompi: 0, gmf: 0, gmfSalida: 0, gananciaColbisnes: comisionColbisnes, recibeVendedor: precioBase, testMode: false };
}

// Única comisión de Colbisnes sobre pagos USDT: cargo plano de $5 USD por cada millón
// de COP del precio base (proporcional a la fracción), con un tope de USDT_EXTRA_MAX_USD.
// No se aplica ningún porcentaje adicional ni descuento por nivel de vendedor —
// a diferencia de online/contra-entrega, esta comisión es igual para todos.
export const USDT_EXTRA_USD_POR_MILLON = 5;
export const USDT_EXTRA_MAX_USD        = 500;
export const USDT_EXTRA_TOPE_COP       = (USDT_EXTRA_MAX_USD / USDT_EXTRA_USD_POR_MILLON) * 1_000_000; // 100,000,000

// Colchón (no es comisión/ganancia, cubre costos reales): $2 USD fijos + $2 USD
// adicionales por cada millón de COP, para mitigar la variación de precio entre que
// se genera el cobro y se confirma el pago, más los cobros de red de la blockchain.
// Tiene el mismo tope de $500 USD que la comisión, alcanzado en 250,000,000 COP.
export const USDT_COLCHON_FIJO_USD       = 2;
export const USDT_COLCHON_USD_POR_MILLON = 2;
export const USDT_COLCHON_MAX_USD        = 500;
export const USDT_COLCHON_TOPE_COP       = (USDT_COLCHON_MAX_USD / USDT_COLCHON_USD_POR_MILLON) * 1_000_000; // 250,000,000

// exento: solo apaga comisionUSD (la ganancia de Colbisnes). El colchón NO se toca aunque
// haya exención: no es ganancia, cubre el riesgo real de variación cambiaria entre que se
// genera el cobro y se confirma en blockchain, más el costo real de red — cobrárselo de
// menos al comprador master no le ahorra nada a Colbisnes, simplemente deja el pago corto
// frente a lo que de verdad cuesta liquidarlo.
export function calcularPrecioUSDT(precioBaseCOP: number, tasaCOP: number, nivelVendedor?: string | null, exento: boolean = false): USDTPricing {
  if (TEST_MODE) return { precioBaseUSD: 0.01, comisionUSD: 0, totalUSD: 0.01, wallet: process.env.NEXT_PUBLIC_USDT_WALLET!, red: "BNB Chain (BEP20)", testMode: true };
  const colchonVariable = parseFloat((Math.min(precioBaseCOP, USDT_COLCHON_TOPE_COP) / 1_000_000 * USDT_COLCHON_USD_POR_MILLON).toFixed(2));
  const comisionUSD     = exento ? 0 : parseFloat((Math.min(precioBaseCOP, USDT_EXTRA_TOPE_COP) / 1_000_000 * USDT_EXTRA_USD_POR_MILLON).toFixed(2));
  const precioBaseUSD   = parseFloat((precioBaseCOP / tasaCOP).toFixed(2)) + USDT_COLCHON_FIJO_USD + colchonVariable;
  // Redondeado hacia arriba a múltiplos de 0.10 USDT: más fácil de escribir sin errores
  // de tipeo en la wallet del comprador que un monto con dos decimales cualquiera.
  const totalUSD        = Math.ceil((precioBaseUSD + comisionUSD) * 10) / 10;
  return { precioBaseUSD, comisionUSD, totalUSD, wallet: process.env.NEXT_PUBLIC_USDT_WALLET!, red: "BNB Chain (BEP20)", testMode: false };
}

export interface ExtrasCheckout {
  proteccionCosto: number;
  envioCobrado: number;
  margenEnvio: number;
  extraTotal: number;
}

// Calcula los add-ons opcionales del checkout: protección de compra extendida y margen de envío.
// El "costo de envío" usado es el que el propio vendedor declaró en producto.precioEnvio
// (no existe una API pública de cotización en tiempo real de las transportadoras colombianas).
//
// exentoComprador (perfil MASTER): solo apaga proteccionCosto, y solo cuando el COMPRADOR es
// la cuenta master (protección es un add-on que paga quien compra, no depende de quién vende).
// El margen de envío NO se toca aquí a propósito: no está confirmado si el vendedor se
// reembolsa contra envioCobrado o contra producto.precioEnvio, así que tocarlo a ciegas podría
// cambiar sin querer cuánto le llega al vendedor por el envío. Queda pendiente si se confirma.
export function calcularExtrasCheckout(
  producto: { tipoEntrega: string; precioEnvio?: number | null },
  proteccionExtendida: boolean,
  exentoComprador: boolean = false
): ExtrasCheckout {
  // En modo pruebas el cobro total siempre es TEST_AMOUNT — no se suman extras
  if (TEST_MODE) return { proteccionCosto: 0, envioCobrado: 0, margenEnvio: 0, extraTotal: 0 };

  const proteccionCosto = (proteccionExtendida && !exentoComprador) ? PROTECCION_EXTENDIDA_PRECIO : 0;

  let envioCobrado = 0;
  let margenEnvio  = 0;
  const tieneEnvio = producto.tipoEntrega === "ENVIO" || producto.tipoEntrega === "AMBOS";
  if (tieneEnvio && producto.precioEnvio && producto.precioEnvio > 0) {
    envioCobrado = Math.round(producto.precioEnvio * (1 + MARGEN_ENVIO_PCT));
    margenEnvio  = envioCobrado - producto.precioEnvio;
  }

  return { proteccionCosto, envioCobrado, margenEnvio, extraTotal: proteccionCosto + envioCobrado };
}
