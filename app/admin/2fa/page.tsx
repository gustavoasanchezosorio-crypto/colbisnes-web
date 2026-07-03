"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { THEME } from "@/lib/theme";

export default function Admin2FAPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [cargando, setCargando] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [secret, setSecret] = useState("");
  const [codigo, setCodigo] = useState("");
  const [msg, setMsg] = useState("");
  const [verificando, setVerificando] = useState(false);
  const [hotWallet, setHotWallet] = useState<{ address: string; saldoUSDT: number; saldoBNB: number } | null>(null);
  const [hotWalletError, setHotWalletError] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/login");
  }, [status, router]);

  useEffect(() => {
    if (!session) return;
    fetch("/api/admin/2fa/setup")
      .then(r => r.json())
      .then(d => {
        if (d.enabled) setEnabled(true);
        else if (d.secret) setSecret(d.secret);
        setCargando(false);
      })
      .catch(() => setCargando(false));
  }, [session]);

  useEffect(() => {
    if (!session) return;
    fetch("/api/admin/hot-wallet-info")
      .then(r => r.json())
      .then(d => {
        if (d.address) setHotWallet(d);
        else setHotWalletError(d.error || "Error al consultar la hot wallet");
      })
      .catch(() => setHotWalletError("Error de red al consultar la hot wallet"));
  }, [session]);

  async function confirmar() {
    if (codigo.length < 6) { setMsg("❌ Ingresa el código de 6 dígitos"); return; }
    setVerificando(true);
    setMsg("");
    try {
      const r = await fetch("/api/admin/2fa/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: codigo }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Error al verificar");
      setEnabled(true);
      setMsg("✅ 2FA activado correctamente");
    } catch (e: any) {
      setMsg("❌ " + e.message);
    } finally {
      setVerificando(false);
    }
  }

  if (status === "loading" || !session) return null;

  return (
    <div style={{ minHeight: "100vh", background: THEME.background, fontFamily: "system-ui, sans-serif" }}>
      <header style={{ background: `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`, padding: "0 24px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/logo-white.svg?v=2" alt="Colbisnes" style={{ height: 38, width: "auto" }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", padding: "3px 10px", borderRadius: 20 }}>2FA</span>
        </div>
        <button onClick={() => router.push("/admin")} style={{ padding: "7px 16px", borderRadius: 20, border: "1.5px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.12)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>← Admin</button>
      </header>

      <main style={{ maxWidth: 560, margin: "32px auto", padding: "0 20px 80px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: THEME.text, marginBottom: 8, textAlign: "center" }}>Verificación en dos pasos</h1>
        <p style={{ fontSize: 13.5, color: THEME.muted, marginBottom: 24 }}>
          Requerida para aprobar desembolsos automáticos en USDT desde la hot wallet. Usa Microsoft Authenticator (o cualquier app compatible con TOTP).
        </p>

        <div style={{ background: THEME.surfaceGradient, borderRadius: 20, padding: 24, boxShadow: THEME.cardShadow, marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: THEME.text, marginBottom: 6, textAlign: "center" }}>💧 Hot wallet (fondos para desembolsos automáticos)</h2>
          <p style={{ fontSize: 12.5, color: THEME.muted, marginBottom: 14, textAlign: "center" }}>
            Deposita USDT-BEP20 (para pagar vendedores) y algo de BNB (para el gas) en esta dirección. Es la única wallet que usa el botón "Aprobar y enviar automático".
          </p>
          {hotWalletError ? (
            <p style={{ color: "#b91c1c", fontWeight: 600, fontSize: 13, textAlign: "center" }}>❌ {hotWalletError}</p>
          ) : hotWallet ? (
            <>
              <div style={{ background: THEME.surfaceAlt, borderRadius: 10, padding: "12px 14px", fontFamily: "monospace", fontSize: 13, letterSpacing: 0.5, wordBreak: "break-all", marginBottom: 14, border: `1px solid ${THEME.border}`, textAlign: "center" }}>
                {hotWallet.address}
              </div>
              <div style={{ display: "flex", justifyContent: "center", gap: 24 }}>
                <div style={{ textAlign: "center" }}>
                  <p style={{ margin: 0, fontSize: 20, fontWeight: 900, color: hotWallet.saldoUSDT > 0 ? "#15803d" : "#b91c1c" }}>{hotWallet.saldoUSDT.toFixed(2)}</p>
                  <p style={{ margin: 0, fontSize: 11, color: THEME.muted }}>USDT</p>
                </div>
                <div style={{ textAlign: "center" }}>
                  <p style={{ margin: 0, fontSize: 20, fontWeight: 900, color: hotWallet.saldoBNB > 0.002 ? "#15803d" : "#b91c1c" }}>{hotWallet.saldoBNB.toFixed(4)}</p>
                  <p style={{ margin: 0, fontSize: 11, color: THEME.muted }}>BNB (gas)</p>
                </div>
              </div>
            </>
          ) : (
            <p style={{ color: THEME.muted, textAlign: "center" }}>Cargando...</p>
          )}
        </div>

        {cargando ? (
          <p style={{ color: THEME.muted }}>Cargando...</p>
        ) : enabled ? (
          <div style={{ background: "#dcfce7", color: "#15803d", padding: "16px 20px", borderRadius: 14, fontWeight: 700 }}>
            ✅ El 2FA ya está activado en esta cuenta. Ya puedes usar "Aprobar y enviar automático" en la pestaña de Pagos.
          </div>
        ) : (
          <div style={{ background: THEME.surfaceGradient, borderRadius: 20, padding: 24, boxShadow: THEME.cardShadow }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: THEME.text, marginBottom: 6 }}>1. Abre Microsoft Authenticator</p>
            <p style={{ fontSize: 12.5, color: THEME.muted, marginBottom: 14 }}>
              Toca "+" → "Otra cuenta" → "Escribir clave manualmente" (o similar). Usa el nombre "Colbisnes Admin" y pega esta clave secreta:
            </p>
            <div style={{ background: THEME.surfaceAlt, borderRadius: 10, padding: "12px 14px", fontFamily: "monospace", fontSize: 14, letterSpacing: 1, wordBreak: "break-all", marginBottom: 20, border: `1px solid ${THEME.border}` }}>
              {secret || "Cargando..."}
            </div>

            <p style={{ fontSize: 13, fontWeight: 700, color: THEME.text, marginBottom: 6 }}>2. Ingresa el código de 6 dígitos que muestra la app</p>
            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                value={codigo}
                onChange={e => setCodigo(e.target.value.replace(/\D/g, ""))}
                style={{ flex: 1, padding: "12px 14px", borderRadius: 10, border: `1px solid ${THEME.border}`, fontSize: 16, letterSpacing: 2, textAlign: "center" }}
              />
              <button onClick={confirmar} disabled={verificando} style={{ padding: "12px 20px", borderRadius: 10, border: "none", background: THEME.primary, color: "#fff", fontWeight: 700, cursor: "pointer", opacity: verificando ? 0.6 : 1 }}>
                {verificando ? "Verificando..." : "Activar"}
              </button>
            </div>

            {msg && <p style={{ marginTop: 14, fontWeight: 600, color: msg.startsWith("✅") ? "#15803d" : "#b91c1c" }}>{msg}</p>}
          </div>
        )}
      </main>
    </div>
  );
}
