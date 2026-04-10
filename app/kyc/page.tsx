"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/FormComponents";
import { THEME } from "@/lib/theme";

export default function KycPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [kycStatus, setKycStatus] = useState<any>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (session) {
      fetch("/api/kyc/status")
        .then(res => res.json())
        .then(data => setKycStatus(data))
        .catch(console.error);
    }
  }, [session]);

  const handleStartVerification = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/kyc/start", { method: "POST" });
      const data = await res.json();
      if (data.verificationUrl) {
        window.location.href = data.verificationUrl;
      } else {
        alert("Error al iniciar verificación");
      }
    } catch (error) {
      console.error(error);
      alert("Error al iniciar verificación");
    } finally {
      setLoading(false);
    }
  };

  if (!session) return null;

  return (
    <div style={{ background: THEME.background, minHeight: "100vh" }}>
      <header style={{ background: THEME.primary, padding: "18px 28px", boxShadow: "0 10px 30px rgba(0,0,0,0.15)" }}>
        <div style={{ maxWidth: 1200, margin: "auto" }}>
          <h1 style={{ fontWeight: 800, fontSize: "1.6rem", color: "white", margin: 0 }}>COLBISNES - Verificación de identidad</h1>
        </div>
      </header>
      <main style={{ maxWidth: 600, margin: "2rem auto", padding: "0 1rem" }}>
        <div style={{ background: THEME.surface, borderRadius: 20, padding: "2rem", boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}>
          <h2 style={{ color: THEME.primary }}>Estado de verificación</h2>
          {kycStatus ? (
            <div>
              <p><strong>Nivel:</strong> {kycStatus.kycLevel}</p>
              <p><strong>Estado:</strong> {kycStatus.kycStatus}</p>
              {kycStatus.kycStatus === "approved" && (
                <p style={{ color: "green" }}>✓ Verificado correctamente</p>
              )}
              {kycStatus.kycStatus === "pending" && (
                <p>Tu verificación está en proceso.</p>
              )}
              {kycStatus.kycStatus === "rejected" && (
                <p style={{ color: "red" }}>Verificación rechazada. Intenta de nuevo.</p>
              )}
            </div>
          ) : (
            <p>Cargando...</p>
          )}

          <Button
            onClick={handleStartVerification}
            disabled={loading || kycStatus?.kycStatus === "approved"}
            style={{ marginTop: "2rem", width: "100%" }}
          >
            {loading ? "Iniciando..." : "Iniciar verificación de identidad"}
          </Button>
        </div>
      </main>
    </div>
  );
}
