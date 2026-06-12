"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function MockKycPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const userId = searchParams.get("userId");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) {
      router.push("/kyc");
    }
  }, [userId, router]);

  const handleApprove = async () => {
    if (!userId) return;
    setLoading(true);
    await fetch("/api/kyc/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "decision",
        data: {
          userId: userId, // Usamos el userId real de la URL
          verification: { status: "approved" }
        }
      }),
    });
    router.push("/kyc");
  };

  const handleReject = async () => {
    if (!userId) return;
    setLoading(true);
    await fetch("/api/kyc/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "decision",
        data: {
          userId: userId,
          verification: { status: "declined" }
        }
      }),
    });
    router.push("/kyc");
  };

  return (
    <div style={{ textAlign: "center", padding: "2rem" }}>
      <h1>Simulación de verificación KYC</h1>
      <p>Haz clic en una opción para simular el resultado de la verificación.</p>
      <p><strong>Usuario:</strong> {userId}</p>
      <div style={{ marginTop: "2rem" }}>
        <button
          onClick={handleApprove}
          disabled={loading}
          style={{ padding: "0.75rem 2rem", background: "green", color: "white", border: "none", borderRadius: 5, cursor: "pointer", marginRight: "1rem" }}
        >
          {loading ? "Procesando..." : "Aprobar"}
        </button>
        <button
          onClick={handleReject}
          disabled={loading}
          style={{ padding: "0.75rem 2rem", background: "red", color: "white", border: "none", borderRadius: 5, cursor: "pointer" }}
        >
          {loading ? "Procesando..." : "Rechazar"}
        </button>
      </div>
    </div>
  );
}

import { Suspense } from "react";
export default function MockKycPage() {
  return (
    <Suspense fallback={<div>Cargando...</div>}>
      <MockKycPageInner />
    </Suspense>
  );
}
