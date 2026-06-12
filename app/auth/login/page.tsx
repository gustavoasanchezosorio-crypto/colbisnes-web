"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) setError("Email o contrasena incorrectos");
      else router.push("/");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    await signIn("google", { callbackUrl: "/" });
  };

  const inp = { width: "100%", padding: "11px 15px", borderRadius: 14, border: "1.5px solid #E2E8F5", background: "#FAFBFF", fontSize: 14, color: "#0F172A", outline: "none", boxSizing: "border-box" as const };
  const lbl = { display: "block", fontSize: 12, fontWeight: 700, color: "#64748B", letterSpacing: "0.06em", textTransform: "uppercase" as const, marginBottom: 7 };

  return (
    <div style={{ minHeight: "100vh", background: "#F0F4FF", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 24, padding: "36px 32px", width: "100%", maxWidth: 420, boxShadow: "0 8px 40px rgba(31,107,255,0.1)", border: "1px solid #E2E8F5" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: "linear-gradient(135deg,#1448A3,#1F6BFF)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 900, color: "#fff", margin: "0 auto 12px" }}>C</div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: "#0F172A", margin: 0 }}>COLBISNES</h1>
          <p style={{ fontSize: 14, color: "#64748B", margin: "6px 0 0" }}>Inicia sesion en tu cuenta</p>
        </div>

        <button onClick={handleGoogleLogin} disabled={googleLoading} style={{ width: "100%", padding: "13px", borderRadius: 14, border: "1.5px solid #E2E8F5", background: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 20, color: "#0F172A", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 20-8 20-20 0-1.3-.1-2.7-.4-4z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.1 18.9 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.2C29.5 35.5 26.9 36 24 36c-5.2 0-9.6-2.9-11.3-7.1l-6.6 5.1C9.6 39.6 16.3 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.9 2.5-2.6 4.6-4.8 6l6.2 5.2C40.5 35.5 44 30.1 44 24c0-1.3-.1-2.7-.4-4z"/>
          </svg>
          {googleLoading ? "Conectando..." : "Continuar con Google"}
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1, height: 1, background: "#E2E8F5" }} />
          <span style={{ fontSize: 12, color: "#64748B", fontWeight: 600 }}>O con email</span>
          <div style={{ flex: 1, height: 1, background: "#E2E8F5" }} />
        </div>

        <form onSubmit={handlePasswordLogin}>
          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Email *</label>
            <input type="email" placeholder="tu@email.com" value={email} onChange={e => setEmail(e.target.value)} required style={inp}
              onFocus={e => { e.currentTarget.style.borderColor = "#1F6BFF"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(31,107,255,0.12)"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "#E2E8F5"; e.currentTarget.style.boxShadow = "none"; }} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={lbl}>Contrasena *</label>
            <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required style={inp}
              onFocus={e => { e.currentTarget.style.borderColor = "#1F6BFF"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(31,107,255,0.12)"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "#E2E8F5"; e.currentTarget.style.boxShadow = "none"; }} />
          </div>
          {error && <div style={{ padding: "10px 14px", borderRadius: 10, background: "#FEE2E2", color: "#EF4444", fontSize: 13, fontWeight: 600, marginBottom: 16 }}>⚠️ {error}</div>}
          <button type="submit" disabled={loading} style={{ width: "100%", padding: "13px", background: "linear-gradient(135deg,#1448A3,#1F6BFF)", color: "#fff", border: "none", borderRadius: 14, fontSize: 15, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 14px rgba(31,107,255,0.4)" }}>
            {loading ? "Ingresando..." : "Ingresar"}
          </button>
        </form>

        <p style={{ marginTop: 24, textAlign: "center", fontSize: 14, color: "#64748B" }}>
          No tienes cuenta? <a href="/auth/register" style={{ color: "#1F6BFF", fontWeight: 700, textDecoration: "none" }}>Registrate</a>
        </p>
      </div>
    </div>
  );
}
