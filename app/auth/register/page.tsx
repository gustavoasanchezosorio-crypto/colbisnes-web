"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { THEME } from "@/lib/theme";

const AZUL = THEME.primary;
const DORADO = THEME.gold;

// Solo letras y espacios (sin números ni especiales)
const soloLetras = (v: string) => v.replace(/[^a-zA-ZáéíóúÁÉÍÓÚüÜñÑ\s]/g, "");

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Con Google, NextAuth (PrismaAdapter) crea la cuenta sola en el primer inicio de
  // sesión — no pasa por este formulario ni por la verificación de correo, porque
  // Google ya lo verificó (ver el bloque `account.provider === "google"` en
  // lib/auth.ts). Es el camino más corto posible para registrarse: 2026-09-21,
  // este botón no existía en esta página y solo vivía en /auth/login, así que
  // quien llegaba directo a "Registrarse" nunca se enteraba de que existía.
  const handleGoogleRegister = async () => {
    setGoogleLoading(true);
    await signIn("google", { callbackUrl: "/" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) { setError("El nombre es requerido"); return; }
    if (name.trim().length < 2) { setError("El nombre debe tener al menos 2 letras"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name: name.trim() }),
      });
      if (res.ok) {
        // La cuenta ya quedó creada: iniciamos sesión de una vez con las mismas
        // credenciales que la persona acaba de escribir, en vez de mandarla a
        // /auth/login a re-escribirlas. Si por lo que sea el login automático
        // fallara (no debería: son las credenciales que el registro acaba de
        // aceptar), cae de vuelta al login manual como red de seguridad — la
        // cuenta existe de todas formas.
        const login = await signIn("credentials", { email, password, redirect: false });
        if (login?.error) {
          router.push("/auth/login?registered=1");
        } else {
          router.push("/");
        }
      } else {
        const data = await res.json();
        setError(data.error || "Error al registrar");
      }
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const inp: React.CSSProperties = {
    width: "100%", padding: "0.8rem 1rem", borderRadius: 12,
    border: `1.5px solid ${THEME.border}`, fontSize: "0.95rem",
    outline: "none", boxSizing: "border-box" as const,
    fontFamily: "inherit", background: "#ffffff", color: THEME.text,
  };
  const lbl: React.CSSProperties = {
    display: "block", fontWeight: 700, fontSize: "0.85rem",
    color: THEME.text, marginBottom: "0.4rem",
  };

  return (
    <div style={{ minHeight: "100vh", background: THEME.background, display: "flex", flexDirection: "column", fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif" }}>
      <header style={{ background: `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`, padding: "0 24px", height: 58, display: "flex", alignItems: "center" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center" }}>
          <img src="/logo-white.svg?v=2" alt="Colbisnes" style={{ height: 30, width: "auto", display: "block" }} />
        </Link>
      </header>

      <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem 1rem" }}>
        <div style={{ width: "100%", maxWidth: 420, background: THEME.surfaceGradient, borderRadius: 20, padding: "2rem", boxShadow: THEME.cardShadow, border: "1.5px solid transparent" }}>
          <h1 style={{ color: THEME.text, fontWeight: 900, fontSize: "1.5rem", margin: "0 0 0.25rem", textAlign: "center" }}>Crear cuenta</h1>
          <p style={{ color: THEME.muted, fontSize: "0.85rem", margin: "0 0 1.5rem" }}>Únete a Colbisnes y empieza a comprar y vender</p>

          <button
            type="button" onClick={handleGoogleRegister} disabled={googleLoading}
            style={{ width: "100%", padding: "0.8rem", borderRadius: 12, border: `1.5px solid ${THEME.border}`, background: "#fff", fontSize: "0.9rem", fontWeight: 700, cursor: googleLoading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: "1.1rem", color: THEME.text, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}
          >
            <svg width="20" height="20" viewBox="0 0 48 48">
              <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 20-8 20-20 0-1.3-.1-2.7-.4-4z"/>
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.1 18.9 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.2C29.5 35.5 26.9 36 24 36c-5.2 0-9.6-2.9-11.3-7.1l-6.6 5.1C9.6 39.6 16.3 44 24 44z"/>
              <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.9 2.5-2.6 4.6-4.8 6l6.2 5.2C40.5 35.5 44 30.1 44 24c0-1.3-.1-2.7-.4-4z"/>
            </svg>
            {googleLoading ? "Conectando..." : "Continuar con Google"}
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "1.1rem" }}>
            <div style={{ flex: 1, height: 1, background: THEME.border }} />
            <span style={{ fontSize: 11, color: THEME.muted, fontWeight: 600 }}>O con tus datos</span>
            <div style={{ flex: 1, height: 1, background: THEME.border }} />
          </div>

          <form onSubmit={handleSubmit}>
            {/* Nombre */}
            <div style={{ marginBottom: "1.1rem" }}>
              <label style={lbl}>Nombre completo</label>
              <input
                style={inp} type="text" placeholder="Ej: Gustavo Osorio"
                value={name}
                onChange={e => setName(soloLetras(e.target.value))}
                onKeyDown={e => { if (/[0-9!@#$%^&*()_+=\[\]{};':"\\|,.<>/?]/.test(e.key)) e.preventDefault(); }}
                maxLength={60}
                autoComplete="name"
              />
              <p style={{ fontSize: 11, color: THEME.muted, margin: "3px 0 0" }}>Solo letras, sin números ni símbolos</p>
            </div>

            {/* Email */}
            <div style={{ marginBottom: "1.1rem" }}>
              <label style={lbl}>Correo electrónico</label>
              <input
                style={inp} type="email" placeholder="tu@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required autoComplete="email"
              />
            </div>

            {/* Contraseña */}
            <div style={{ marginBottom: "1.1rem" }}>
              <label style={lbl}>Contraseña</label>
              <div style={{ position: "relative" }}>
                <input
                  style={{ ...inp, paddingRight: "3rem" }}
                  type={showPass ? "text" : "password"}
                  placeholder="Mínimo 8 caracteres"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required autoComplete="new-password"
                />
                <button type="button" onClick={() => setShowPass(p => !p)}
                  style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: "1rem", color: THEME.muted }}>
                  {showPass ? "🙈" : "👁️"}
                </button>
              </div>
              <p style={{ fontSize: 11, color: THEME.muted, margin: "3px 0 0" }}>Mín. 8 caracteres, una mayúscula y un número</p>
            </div>

            {error && (
              <div style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: "0.6rem 0.85rem", marginBottom: "1rem", color: "#b91c1c", fontSize: "0.85rem", fontWeight: 600 }}>
                ❌ {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              style={{ width: "100%", padding: "0.9rem", background: loading ? "#e2e8f0" : `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`, color: "white", border: "none", borderRadius: 12, fontWeight: 800, fontSize: "1rem", cursor: loading ? "not-allowed" : "pointer", marginBottom: "1rem" }}>
              {loading ? "Creando cuenta..." : "Registrarse"}
            </button>

            <p style={{ textAlign: "center", fontSize: "0.85rem", color: THEME.muted, margin: 0 }}>
              ¿Ya tienes cuenta?{" "}
              <Link href="/auth/login" style={{ color: THEME.primary, fontWeight: 700, textDecoration: "none" }}>Inicia sesión</Link>
            </p>
          </form>
        </div>
      </main>
    </div>
  );
}
