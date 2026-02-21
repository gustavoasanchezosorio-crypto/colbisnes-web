"use client";

import { useEffect } from "react";

export default function ExpirationPoller(): null {
  useEffect(() => {
    const liberar = async () => {
      try {
        await fetch("/api/cron/liberar", { method: "POST" });
      } catch (error) {
        console.error("Error liberando pagos vencidos:", error);
      }
    };

    liberar();
    const interval = setInterval(liberar, 30000);
    return () => clearInterval(interval);
  }, []);

  return null;
}
