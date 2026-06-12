export const WOMPI_PCT            = 0.0265;
export const WOMPI_FIXED          = 700;
export const WOMPI_IVA            = 0.19;
export const GMF_PCT              = 0.004;
export const COLBISNES_PCT_ONLINE = 0.10;
export const COLBISNES_PCT_CE     = 0.03;
export const COLBISNES_PCT_USDT   = 0.05;

export interface PricingBreakdown {
  precioBase: number;
  comisionColbisnes: number;
  totalComprador: number;
  costoWompi: number;
  gmf: number;
  gananciaColbisnes: number;
  recibeVendedor: number;
}

export interface USDTPricing {
  precioBaseUSD: number;
  comisionUSD: number;
  totalUSD: number;
  wallet: string;
  red: string;
}

export function calcularPrecioOnline(precioBase: number): PricingBreakdown {
  const comisionColbisnes = Math.round(precioBase * COLBISNES_PCT_ONLINE);
  const totalComprador    = precioBase + comisionColbisnes;
  const wompiBase         = totalComprador * WOMPI_PCT + WOMPI_FIXED;
  const costoWompi        = Math.round(wompiBase * (1 + WOMPI_IVA));
  const gmf               = Math.round(totalComprador * GMF_PCT);
  const gananciaColbisnes = comisionColbisnes - costoWompi - gmf;
  return { precioBase, comisionColbisnes, totalComprador, costoWompi, gmf, gananciaColbisnes, recibeVendedor: precioBase };
}

export function calcularPrecioContraEntrega(precioBase: number): PricingBreakdown {
  const comisionColbisnes = Math.round(precioBase * COLBISNES_PCT_CE);
  const totalComprador    = precioBase + comisionColbisnes;
  return { precioBase, comisionColbisnes, totalComprador, costoWompi: 0, gmf: 0, gananciaColbisnes: comisionColbisnes, recibeVendedor: precioBase };
}

export function calcularPrecioUSDT(precioBaseCOP: number, tasaCOP: number): USDTPricing {
  const precioBaseUSD = parseFloat((precioBaseCOP / tasaCOP).toFixed(2));
  const comisionUSD   = parseFloat((precioBaseUSD * COLBISNES_PCT_USDT).toFixed(2));
  const totalUSD      = parseFloat((precioBaseUSD + comisionUSD).toFixed(2));
  return {
    precioBaseUSD,
    comisionUSD,
    totalUSD,
    wallet: process.env.NEXT_PUBLIC_USDT_WALLET!,
    red: "BNB Chain (BEP20)",
  };
}
