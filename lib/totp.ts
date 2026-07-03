import { generateSecret, generateURI, verify } from "otplib";

// Configuración estándar TOTP (RFC 6238) — 30s, 6 dígitos, compatible con Microsoft Authenticator,
// Google Authenticator, Authy, etc.

export function generarSecretoTOTP(): string {
  return generateSecret();
}

export function generarOtpauthUri(secret: string, email: string): string {
  return generateURI({ issuer: "Colbisnes Admin", label: email, secret });
}

export async function verificarCodigoTOTP(secret: string, token: string): Promise<boolean> {
  try {
    const result = await verify({ secret, token: token.trim(), epochTolerance: 30 });
    return result.valid;
  } catch {
    return false;
  }
}
