"use client";

import { useEffect } from "react";
import { BANNER_MODO_PRUEBA } from "@/lib/modoPrueba";
import { useModoPrueba } from "@/lib/useModoPrueba";

/**
 * Franja fija de aviso para los probadores del prelanzamiento.
 *
 * Va montada en app/layout.tsx, así que aparece en TODAS las páginas. Solo se
 * pinta si el navegador entró con el link secreto `?acceso=CÓDIGO` y la ventana
 * de prelanzamiento sigue abierta: el día que se apague COMING_SOON el
 * middleware borra la cookie y esta franja desaparece sola.
 *
 * Está arriba, ocupa todo el ancho y va por encima de cualquier otra cosa
 * (el widget de chat vive en z-index 1900) porque el objetivo es justamente que
 * no se pueda pasar por alto: quien esté probando debe saber en todo momento que
 * está en producción y que nada de lo que haga mueve dinero de verdad.
 */
export default function BannerModoPrueba() {
  const modoPrueba = useModoPrueba();

  // La franja es `position: fixed`, así que no empuja el contenido por sí sola y
  // taparía la cabecera del sitio. Se compensa con un padding en el <body> que se
  // pone y se quita junto con el banner. Solo ocurre en modo prueba: en la web
  // pública este efecto no hace nada.
  useEffect(() => {
    if (!modoPrueba) return;
    const anterior = document.body.style.paddingTop;
    document.body.style.paddingTop = "34px";
    return () => {
      document.body.style.paddingTop = anterior;
    };
  }, [modoPrueba]);

  if (!modoPrueba) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 34,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        // Amarillo/naranja, con borde inferior oscuro para que se despegue del
        // contenido aunque la página tenga fondo claro.
        background: "linear-gradient(90deg,#f59e0b,#fbbf24 50%,#f59e0b)",
        borderBottom: "1px solid #b45309",
        color: "#3f2600",
        fontSize: 12.5,
        fontWeight: 900,
        letterSpacing: 0.4,
        textAlign: "center",
        padding: "0 12px",
        boxShadow: "0 2px 10px rgba(0,0,0,0.18)",
        zIndex: 2147483000,
        // No debe interceptar clics: es un aviso, no un elemento interactivo.
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      <span aria-hidden="true">⚠️</span>
      <span>{BANNER_MODO_PRUEBA}</span>
    </div>
  );
}
