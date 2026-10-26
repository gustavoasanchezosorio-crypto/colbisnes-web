import { generateSecret, generateURI, verify } from "otplib";
import { rateLimit } from "@/lib/rateLimit";

// Configuración estándar TOTP (RFC 6238) — 30s, 6 dígitos, compatible con Microsoft Authenticator,
// Google Authenticator, Authy, etc.

export function generarSecretoTOTP(): string {
  return generateSecret();
}

export function generarOtpauthUri(secret: string, email: string): string {
  return generateURI({ issuer: "Colbisnes Admin", label: email, secret });
}

// identifier: quién intenta el código (el id del admin ya autenticado por sesión en cada
// call site). Esto protege las ~10 rutas de admin que hacen step-up 2FA (liberar-pago,
// liberar-pago-auto, kyc/approve, resolver disputas, etc.): sin límite de intentos, una
// sesión de admin comprometida (cookie robada, XSS) pero sin el celular con el
// autenticador podría intentar fuerza bruta sobre el código de 6 dígitos sin ningún freno.
// Se limita por admin (no por IP) para no bloquear a un admin legítimo si otro falla desde
// la misma red, y para que el límite viaje con la cuenta sin importar desde dónde se intente.
export async function verificarCodigoTOTP(secret: string, token: string, identifier: string): Promise<boolean> {
  const { allowed } = rateLimit(`totp:${identifier}`, { limit: 8, windowSeconds: 300 });
  if (!allowed) return false;
  try {
    const result = await verify({ secret, token: token.trim(), epochTolerance: 30 });
    return result.valid;
  } catch {
    return false;
  }
}
