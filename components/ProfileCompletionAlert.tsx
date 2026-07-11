"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { THEME } from "@/lib/theme";
import { computeProfileCompletion, type ProfileCompletion } from "@/lib/profileCompletion";

// Muestra el % de perfil completado y lanza un popup recordatorio en las pantallas
// del usuario hasta que llegue al 100%. Se oculta en la página de edición de perfil
// (donde justamente está completando los datos) para no estorbar.
export default function ProfileCompletionAlert() {
  const { status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [data, setData] = useState<ProfileCompletion | null>(null);
  const [showPopup, setShowPopup] = useState(false);

  // No estorbar en: la edición de perfil (donde ya se completan los datos), el panel
  // de administración (el admin no compra/vende) ni las pantallas de autenticación.
  const ocultar = pathname?.startsWith("/perfil/editar")
    || pathname?.startsWith("/admin")
    || pathname?.startsWith("/auth");

  useEffect(() => {
    if (status !== "authenticated") { setData(null); return; }
    let vivo = true;
    fetch("/api/user", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => {
        if (!vivo || !u) return;
        const c = computeProfileCompletion(u);
        setData(c);
        // El popup se muestra una sola vez por sesión (la barra de progreso sí queda siempre).
        const yaMostrado = typeof window !== "undefined" && sessionStorage.getItem("perfilPopupVisto") === "1";
        if (c.percent < 100 && !yaMostrado) {
          setShowPopup(true);
          try { sessionStorage.setItem("perfilPopupVisto", "1"); } catch {}
        }
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, [status, pathname]);

  if (status !== "authenticated" || !data || data.percent >= 100 || ocultar) return null;

  const irAlPerfil = () => { setShowPopup(false); router.push("/perfil/editar?falta=pago"); };

  return (
    <>
      {/* Barra/pill de progreso persistente (esquina inferior) */}
      <div
        onClick={() => setShowPopup(true)}
        style={{
          position: "fixed", bottom: 88, left: 16, zIndex: 9000, cursor: "pointer",
          background: "#fff", borderRadius: 14, padding: "10px 14px",
          boxShadow: "0 8px 30px rgba(10,46,107,0.18)", border: `1px solid ${THEME.border}`,
          display: "flex", alignItems: "center", gap: 10, maxWidth: 240,
        }}
      >
        <div style={{ position: "relative", width: 34, height: 34, flexShrink: 0 }}>
          <svg width="34" height="34" viewBox="0 0 34 34">
            <circle cx="17" cy="17" r="15" fill="none" stroke={THEME.border} strokeWidth="4" />
            <circle
              cx="17" cy="17" r="15" fill="none" stroke={THEME.primary} strokeWidth="4"
              strokeLinecap="round" strokeDasharray={2 * Math.PI * 15}
              strokeDashoffset={2 * Math.PI * 15 * (1 - data.percent / 100)}
              transform="rotate(-90 17 17)"
            />
          </svg>
          <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9.5, fontWeight: 800, color: THEME.primary }}>{data.percent}%</span>
        </div>
        <div style={{ lineHeight: 1.25 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: THEME.text }}>Perfil incompleto</p>
          <p style={{ margin: 0, fontSize: 10.5, color: THEME.muted }}>Toca para completarlo</p>
        </div>
      </div>

      {/* Popup recordatorio */}
      {showPopup && (
        <div
          onClick={() => setShowPopup(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(13,27,42,0.55)", backdropFilter: "blur(10px)", zIndex: 9500, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 26, padding: "30px 26px", maxWidth: 360, width: "100%", textAlign: "center", boxShadow: "0 20px 70px rgba(10,46,107,0.30)" }}
          >
            <div style={{ fontSize: 48, marginBottom: 8 }}>📋</div>
            <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800, color: THEME.text }}>Completa tu perfil</h2>
            <p style={{ margin: "0 0 18px", fontSize: 14, color: THEME.muted, lineHeight: 1.5 }}>
              Tu perfil está al <b style={{ color: THEME.primary }}>{data.percent}%</b>. Completa tus datos de pago y envío para que <b>ningún pago se pierda</b> y puedas comprar y vender sin problemas.
            </p>

            {/* Barra */}
            <div style={{ height: 10, borderRadius: 8, background: THEME.border, overflow: "hidden", marginBottom: 16 }}>
              <div style={{ height: "100%", width: `${data.percent}%`, background: `linear-gradient(90deg, ${THEME.primaryLight}, ${THEME.primary})`, borderRadius: 8, transition: "width .4s ease" }} />
            </div>

            {/* Faltantes */}
            {data.faltantes.length > 0 && (
              <div style={{ textAlign: "left", background: THEME.surfaceAlt, borderRadius: 14, padding: "12px 14px", marginBottom: 18, border: `1px solid ${THEME.border}` }}>
                <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 800, color: THEME.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>Te falta:</p>
                {data.faltantes.slice(0, 5).map((f) => (
                  <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ color: "#f59e0b", fontSize: 13 }}>●</span>
                    <span style={{ fontSize: 13, color: THEME.text }}>{f.label}</span>
                  </div>
                ))}
                {data.faltantes.length > 5 && (
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: THEME.muted }}>y {data.faltantes.length - 5} más…</p>
                )}
              </div>
            )}

            <button
              onClick={irAlPerfil}
              style={{ width: "100%", padding: 15, borderRadius: 15, border: "none", background: `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`, color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer", boxShadow: `0 8px 28px ${THEME.primary}44`, marginBottom: 10 }}
            >
              Completar mi perfil →
            </button>
            <button
              onClick={() => setShowPopup(false)}
              style={{ width: "100%", padding: 11, borderRadius: 15, border: `1.5px solid ${THEME.border}`, background: "transparent", color: THEME.muted, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              Más tarde
            </button>
          </div>
        </div>
      )}
    </>
  );
}
