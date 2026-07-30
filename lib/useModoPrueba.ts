"use client";

import { useEffect, useState } from "react";
import { COOKIE_MODO_PRUEBA_UI } from "@/lib/modoPrueba";

/**
 * ¿Este navegador está en modo prueba? (lado cliente)
 *
 * Lee la cookie NO httpOnly que fija el middleware. Esa cookie es puramente
 * informativa: sirve para pintar el banner y para deshabilitar el botón de pago.
 * Los bloqueos de dinero de verdad viven en el servidor (ver lib/modoPrueba.ts) y
 * miran la cookie httpOnly, que el navegador ni siquiera puede leer. Es decir:
 * falsear esta cookie a mano no desbloquea absolutamente nada, y borrarla no
 * salta ningún candado — solo esconde el aviso.
 *
 * Empieza en `false` y se actualiza tras montar. Es intencional: en el servidor
 * no hay `document`, y arrancar en false evita un desajuste de hidratación y, de
 * paso, evita convertir en dinámicas páginas que hoy son estáticas.
 */
export function useModoPrueba(): boolean {
  const [activo, setActivo] = useState(false);

  useEffect(() => {
    const marca = document.cookie
      .split(";")
      .map((t) => t.trim())
      .find((t) => t.startsWith(COOKIE_MODO_PRUEBA_UI + "="));
    setActivo(marca?.slice(COOKIE_MODO_PRUEBA_UI.length + 1) === "1");
  }, []);

  return activo;
}
