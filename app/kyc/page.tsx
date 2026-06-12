"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function KycPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [kycStatus, setKycStatus] = useState("none");
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/login");
  }, [status, router]);

  useEffect(() => {
    if (session) {
      fetch("/api/kyc/status", { credentials: "include" })
        .then(res => res.json())
        .then(data => { setKycStatus(data.kycStatus || "none"); setLoading(false); })
        .catch(() => setLoading(false));
    }
  }, [session]);

  const handleStartVerification = async () => {
    setStarting(true);
    setMessage("");
    try {
      const res = await fetch("/api/kyc/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al iniciar verificación");
      if (data.status === "approved") {
        setKycStatus("approved");
        return;
      }
      if (data.verificationUrl) {
        window.location.href = data.verificationUrl;
      } else {
        throw new Error("No se recibió URL de verificación");
      }
    } catch (err: any) {
      setMessage("❌ " + (err.message || "Error al iniciar verificación"));
    } finally {
      setStarting(false);
    }
  };

  if (loading || !session) return (
    <div style={{ minHeight: "100vh", background: "#F0F4FF", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748B" }}>
      Cargando...
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#F0F4FF" }}>
      {/* Header */}
      <header style={{ background: "linear-gradient(135deg,#1448A3,#1F6BFF)", padding: "0 24px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 20, fontWeight: 900, color: "#fff", letterSpacing: "0.05em" }}>COLBISNES</span>
        <button onClick={() => router.back()} style={{ padding: "7px 16px", borderRadius: 20, border: "1.5px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.12)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>← Volver</button>
      </header>

      <main style={{ maxWidth: 520, margin: "36px auto", padding: "0 20px 60px" }}>
        {/* Title */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 52, marginBottom: 10 }}>🛡️</div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: "#0F172A", margin: "0 0 8px" }}>
            Verificación de identidad
          </h1>
          <p style={{ fontSize: 14, color: "#64748B", margin: 0, lineHeight: 1.6 }}>
            Requerida para comprar y vender en Colbisnes
          </p>
        </div>

        {/* Status card */}
        {kycStatus === "approved" ? (
          <div style={{ background: "#D1FAE5", border: "1px solid #6EE7B7", borderRadius: 20, padding: "32px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>✅</div>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: "#065F46", margin: "0 0 8px" }}>Identidad verificada</h2>
            <p style={{ color: "#047857", fontSize: 14, margin: "0 0 20px" }}>Tu cuenta está verificada. Puedes comprar y vender libremente.</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button onClick={() => router.push("/")} style={{ padding: "11px 22px", borderRadius: 20, border: "none", background: "#10B981", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                Ir al inicio
              </button>
              <button onClick={() => router.push(`/user/${session.user?.id}`)} style={{ padding: "11px 22px", borderRadius: 20, border: "1.5px solid #10B981", background: "transparent", color: "#10B981", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                Ver perfil
              </button>
            </div>
          </div>
        ) : kycStatus === "pending" ? (
          <div style={{ background: "#FEF3C7", border: "1px solid #FCD34D", borderRadius: 20, padding: "32px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>⏳</div>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: "#92400E", margin: "0 0 8px" }}>Verificación en proceso</h2>
            <p style={{ color: "#B45309", fontSize: 14, margin: "0 0 20px" }}>Estamos revisando tu documentación. Te notificaremos cuando esté lista (puede tomar unos minutos).</p>
            <button onClick={() => window.location.reload()} style={{ padding: "11px 22px", borderRadius: 20, border: "none", background: "#F59E0B", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              Verificar estado
            </button>
          </div>
        ) : kycStatus === "rejected" ? (
          <div style={{ background: "#FEE2E2", border: "1px solid #FCA5A5", borderRadius: 20, padding: "32px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>❌</div>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: "#991B1B", margin: "0 0 8px" }}>Verificación rechazada</h2>
            <p style={{ color: "#B91C1C", fontSize: 14, margin: "0 0 20px" }}>Tu verificación fue rechazada. Puedes intentarlo de nuevo con documentos más claros.</p>
            <button onClick={handleStartVerification} disabled={starting} style={{ padding: "11px 22px", borderRadius: 20, border: "none", background: "#EF4444", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              Intentar de nuevo
            </button>
          </div>
        ) : (
          <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #E2E8F5", overflow: "hidden", boxShadow: "0 4px 24px rgba(31,107,255,0.07)" }}>
            <div style={{ height: 4, background: "linear-gradient(90deg,#1448A3,#1F6BFF)" }} />
            <div style={{ padding: "28px 24px" }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: "#0F172A", margin: "0 0 16px" }}>
                ¿Qué necesitas para verificarte?
              </h2>

              {/* Requirements */}
              <div style={{ display: "grid", gap: 10, marginBottom: 24 }}>
                {[
                  { icon: "🪪", title: "Cédula de ciudadanía", desc: "Foto frontal y trasera de tu cédula colombiana" },
                  { icon: "🤳", title: "Selfie en vivo", desc: "Una foto tuya para comparar con el documento" },
                  { icon: "💡", title: "Buena iluminación", desc: "Asegúrate de tener buena luz al tomar las fotos" },
                ].map((req, i) => (
                  <div key={i} style={{ display: "flex", gap: 14, padding: "12px 16px", borderRadius: 14, background: "#FAFBFF", border: "1px solid #E2E8F5" }}>
                    <span style={{ fontSize: 24, flexShrink: 0 }}>{req.icon}</span>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 2 }}>{req.title}</div>
                      <div style={{ fontSize: 12, color: "#64748B" }}>{req.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              {message && (
                <div style={{ padding: "10px 14px", borderRadius: 10, background: "#FEE2E2", color: "#EF4444", fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
                  {message}
                </div>
              )}

              <button
                onClick={handleStartVerification}
                disabled={starting}
                style={{ width: "100%", padding: "14px", borderRadius: 16, border: "none", background: starting ? "#94A3B8" : "linear-gradient(135deg,#1448A3,#1F6BFF)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: starting ? "not-allowed" : "pointer", boxShadow: starting ? "none" : "0 4px 14px rgba(31,107,255,0.4)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
              >
                {starting ? "Iniciando verificación..." : "🪪 Verificar mi identidad"}
              </button>

              <p style={{ fontSize: 11, color: "#94A3B8", textAlign: "center", margin: "14px 0 0", lineHeight: 1.5 }}>
                Serás redirigido a Veriff, nuestra plataforma de verificación de identidad certificada. El proceso toma menos de 2 minutos.
              </p>
            </div>
          </div>
        )}

        {/* Security note */}
        <div style={{ marginTop: 16, padding: "14px 18px", borderRadius: 14, background: "#FAFBFF", border: "1px solid #E2E8F5", display: "flex", gap: 10 }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>🔒</span>
          <p style={{ fontSize: 12, color: "#64748B", margin: 0, lineHeight: 1.6 }}>
            Tu información es procesada por <strong>Veriff</strong>, plataforma certificada de verificación de identidad. Tus datos están protegidos y nunca se comparten con terceros.
          </p>
        </div>
      </main>
    </div>
  );
}
