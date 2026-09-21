"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { THEME } from "@/lib/theme";

const ALTURA_BANNER = 44;

/**
 * Aviso persistente para quien inició sesión pero nunca confirmó su correo.
 *
 * Antes de esto, la única pista de que falta confirmar era el correo original
 * (que puede irse a spam, olvidarse o ignorarse sin más) y la pantalla de
 * verificación cuando el enlace ya expiró — pero eso solo lo ve quien SÍ hizo
 * clic. Quien nunca abrió el correo navega como si todo estuviera normal hasta
 * el día que intenta publicar o pagar y lib/requireEmailVerified.ts le
 * devuelve un 403 de la nada. El 2026-09-21, 7 de 23 cuentas (30%) seguían sin
 * verificar: este banner existe para que se enteren mucho antes de chocar con
 * ese muro, en vez de silenciosamente nunca poder comprar ni vender.
 *
 * Se oculta en /auth (ahí ya se explica solo), /admin (el admin no
 * compra/vende) y /coming-soon (ni pantalla de sesión tiene). Mismo patrón que
 * components/ProfileCompletionAlert.tsx (sesión + fetch a /api/user) y
 * components/BannerModoPrueba.tsx (franja fija arriba + padding compensado en
 * el body para no tapar la cabecera de cada página).
 */
export default function VerifyEmailAlert() {
  const { status } = useSession();
  const pathname = usePathname();
  const [verificado, setVerificado] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const ocultar = pathname?.startsWith("/auth")
    || pathname?.startsWith("/admin")
    || pathname?.startsWith("/coming-soon");

  useEffect(() => {
    if (status !== "authenticated") { setVerificado(null); return; }
    let vivo = true;
    fetch("/api/user", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => {
        if (!vivo || !u) return;
        setVerificado(Boolean(u.emailVerified));
        setEmail(u.email || "");
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, [status]);

  const mostrar = status === "authenticated" && verificado === false && !ocultar;

  // La franja es `position: fixed`, así que no empuja el contenido por sí sola
  // y taparía la cabecera de cada página. Se compensa con un padding en el
  // <body>, igual que hace BannerModoPrueba.
  useEffect(() => {
    if (!mostrar) return;
    const anterior = document.body.style.paddingTop;
    document.body.style.paddingTop = `${ALTURA_BANNER}px`;
    return () => { document.body.style.paddingTop = anterior; };
  }, [mostrar]);

  if (!mostrar) return null;

  const reenviar = async () => {
    if (!email || enviando) return;
    setEnviando(true);
    try {
      await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setEnviado(true);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        minHeight: ALTURA_BANNER,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        background: `linear-gradient(90deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`,
        color: "#fff",
        fontSize: 13,
        fontWeight: 700,
        textAlign: "center",
        padding: "8px 16px",
        boxShadow: "0 2px 10px rgba(0,0,0,0.18)",
        zIndex: 9400,
      }}
    >
      <span>📩 Confirma tu correo para poder comprar y vender en Colbisnes.</span>
      {enviado ? (
        <span style={{ fontWeight: 800 }}>✅ Enviado, revisa tu bandeja (o spam)</span>
      ) : (
        <button
          onClick={reenviar}
          disabled={enviando}
          style={{
            background: "#fff",
            color: THEME.primary,
            border: "none",
            borderRadius: 999,
            padding: "5px 14px",
            fontSize: 12.5,
            fontWeight: 800,
            cursor: enviando ? "not-allowed" : "pointer",
          }}
        >
          {enviando ? "Enviando…" : "Reenviar correo"}
        </button>
      )}
    </div>
  );
}
