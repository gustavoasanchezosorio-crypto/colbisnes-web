"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { THEME } from "@/lib/theme";

function RedirectContent() {
  const params  = useSearchParams();
  const router  = useRouter();
  const orderId = params.get("orderId") || params.get("id");

  useEffect(() => {
    if (!orderId) { router.replace("/"); return; }

    // Sincronizar: si el pago fue rechazado, liberar el producto inmediatamente
    fetch("/api/checkout/sincronizar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.productId) {
          // Redirigir al producto — el estado ya está actualizado
          router.replace("/product/" + d.productId);
        } else {
          router.replace("/");
        }
      })
      .catch(() => { router.replace("/"); });
  }, [orderId, router]);

  return (
    <div style={{
      minHeight: "100vh",
      background: THEME.background,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif",
      gap: 16,
    }}>
      <div style={{
        width: 48, height: 48,
        border: `3px solid ${THEME.border}`,
        borderTopColor: THEME.primary,
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }}/>
      <p style={{ color: THEME.primary, fontSize: 15, fontWeight: 600, margin: 0 }}>
        Verificando pago…
      </p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function ConfirmacionPage() {
  return (
    <Suspense fallback={<div>Cargando...</div>}>
      <RedirectContent />
    </Suspense>
  );
}
