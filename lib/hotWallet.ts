import { ethers } from "ethers";

// Misma red y contrato USDT-BEP20 que usa /api/usdt/verificar
const USDT_BEP20_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";
const USDT_DECIMALS = 18;

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

function getRpcUrl(): string {
  const key = process.env.MEGANODE_API_KEY;
  if (!key) throw new Error("MEGANODE_API_KEY no configurada");
  return `https://bsc-mainnet.nodereal.io/v1/${key}`;
}

export function getProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(getRpcUrl());
}

export function getHotWallet(): ethers.Wallet {
  const pk = process.env.HOT_WALLET_PRIVATE_KEY;
  if (!pk) throw new Error("HOT_WALLET_PRIVATE_KEY no configurada");
  return new ethers.Wallet(pk, getProvider());
}

export function esDireccionValida(address: string): boolean {
  try {
    return ethers.isAddress(address);
  } catch {
    return false;
  }
}

export async function obtenerSaldoUSDT(address: string): Promise<number> {
  const provider = getProvider();
  const contrato = new ethers.Contract(USDT_BEP20_ADDRESS, ERC20_ABI, provider);
  const saldo: bigint = await contrato.balanceOf(address);
  return Number(ethers.formatUnits(saldo, USDT_DECIMALS));
}

export async function obtenerSaldoBNB(address: string): Promise<number> {
  const provider = getProvider();
  const saldo = await provider.getBalance(address);
  return Number(ethers.formatEther(saldo));
}

// Envía USDT-BEP20 desde la hot wallet hacia la dirección del vendedor.
// Lanza error si el saldo (USDT o BNB para gas) es insuficiente.
export async function enviarUSDT(toAddress: string, amountUSD: number): Promise<string> {
  if (!esDireccionValida(toAddress)) throw new Error("Dirección de destino inválida");

  const wallet = getHotWallet();
  const contrato = new ethers.Contract(USDT_BEP20_ADDRESS, ERC20_ABI, wallet);

  const saldoUSDT = await obtenerSaldoUSDT(wallet.address);
  if (saldoUSDT < amountUSD) {
    throw new Error(`Saldo insuficiente en hot wallet: tiene ${saldoUSDT.toFixed(2)} USDT, se requieren ${amountUSD.toFixed(2)} USDT`);
  }

  const saldoBNB = await obtenerSaldoBNB(wallet.address);
  if (saldoBNB < 0.002) {
    throw new Error(`Saldo de BNB insuficiente para gas: tiene ${saldoBNB.toFixed(4)} BNB`);
  }

  const amountWei = ethers.parseUnits(amountUSD.toFixed(6), USDT_DECIMALS);
  const tx = await contrato.transfer(toAddress, amountWei);
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error("La transacción on-chain falló");
  }
  return tx.hash;
}
