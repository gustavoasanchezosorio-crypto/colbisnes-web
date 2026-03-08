"use client";

import { useEffect } from "react";

export default function ExpirationPoller() {
  useEffect(() => {
    const liberar = async () => {
      try {
        await fetch("/api/cron/liberar", {
          method: "POST",
        });
      } catch (error) {
        console.error("Error liberando expirados:", error);
      }
    };

    // Ejecutar al montar
    liberar();

    // Ejecutar cada 30 segundos
    const interval = setInterval(liberar, 30000);

    return () => clearInterval(interval);
  }, []);

  return null;
}
