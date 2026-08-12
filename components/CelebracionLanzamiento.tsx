"use client";

import { useEffect, useRef, useState } from "react";

// Globos y fuegos artificiales de bienvenida, solo el día de la apertura.
//
// Se apaga solo: fuera del 12 de agosto de 2026 (hora de Colombia) el componente
// devuelve null y no engancha ningún temporizador ni lienzo. No hay que acordarse
// de quitarlo.
//
// Nunca bloquea la web: el lienzo va con pointer-events:none, así que los clics
// pasan de largo, y la animación se detiene sola a los 9 segundos.
const INICIO = Date.parse("2026-08-12T00:00:00-05:00");
const FIN = Date.parse("2026-08-13T00:00:00-05:00");

const DURACION_MS = 9000;
const DESVANECIDO_MS = 1400;

const COLORES = ["#1F6BFF", "#FFD400", "#FF3B5C", "#00C48C", "#FF8A00", "#A855F7"];

const azar = (min: number, max: number) => min + Math.random() * (max - min);
const colorAzar = () => COLORES[Math.floor(Math.random() * COLORES.length)];

interface Globo {
  x: number;
  y: number;
  r: number;
  vy: number;
  amplitud: number;
  fase: number;
  color: string;
}

interface Chispa {
  x: number;
  y: number;
  vx: number;
  vy: number;
  vida: number;
  color: string;
}

export default function CelebracionLanzamiento() {
  const [activo, setActivo] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // La decisión se toma en el navegador a propósito: en el servidor no sabemos
  // si esta persona pidió menos animación en los ajustes de su teléfono.
  useEffect(() => {
    const ahora = Date.now();
    if (ahora < INICIO || ahora >= FIN) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
    setActivo(true);
  }, []);

  useEffect(() => {
    if (!activo) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let ancho = 0;
    let alto = 0;

    const ajustar = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ancho = window.innerWidth;
      alto = window.innerHeight;
      canvas.width = Math.floor(ancho * dpr);
      canvas.height = Math.floor(alto * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    ajustar();
    window.addEventListener("resize", ajustar);

    const globos: Globo[] = Array.from({ length: 16 }, () => ({
      x: azar(0.05, 0.95) * ancho,
      y: azar(alto * 1.05, alto * 2.4),
      r: azar(15, 27),
      vy: azar(0.55, 1.15),
      amplitud: azar(8, 26),
      fase: azar(0, Math.PI * 2),
      color: colorAzar(),
    }));

    let chispas: Chispa[] = [];

    const estallar = (x: number, y: number) => {
      const color = colorAzar();
      const n = 32;
      for (let i = 0; i < n; i++) {
        const ang = (Math.PI * 2 * i) / n + azar(-0.06, 0.06);
        const vel = azar(1.6, 4.4);
        chispas.push({ x, y, vx: Math.cos(ang) * vel, vy: Math.sin(ang) * vel, vida: 1, color });
      }
    };

    let rafId = 0;
    let inicio = 0;
    let ultimoEstallido = 0;

    const dibujarGlobo = (g: Globo, t: number) => {
      const x = g.x + Math.sin(t / 900 + g.fase) * g.amplitud;
      ctx.fillStyle = g.color;
      ctx.beginPath();
      ctx.ellipse(x, g.y, g.r, g.r * 1.22, 0, 0, Math.PI * 2);
      ctx.fill();
      // Brillo, para que no parezca un círculo plano.
      ctx.fillStyle = "rgba(255,255,255,0.32)";
      ctx.beginPath();
      ctx.ellipse(x - g.r * 0.32, g.y - g.r * 0.45, g.r * 0.22, g.r * 0.34, -0.5, 0, Math.PI * 2);
      ctx.fill();
      // Nudo.
      ctx.fillStyle = g.color;
      ctx.beginPath();
      ctx.moveTo(x - g.r * 0.16, g.y + g.r * 1.2);
      ctx.lineTo(x + g.r * 0.16, g.y + g.r * 1.2);
      ctx.lineTo(x, g.y + g.r * 1.42);
      ctx.closePath();
      ctx.fill();
      // Cuerda.
      ctx.strokeStyle = "rgba(148,163,184,0.55)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, g.y + g.r * 1.42);
      ctx.quadraticCurveTo(x + Math.sin(t / 700 + g.fase) * 9, g.y + g.r * 1.42 + 22, x, g.y + g.r * 1.42 + 42);
      ctx.stroke();
    };

    const paso = (ts: number) => {
      if (!inicio) inicio = ts;
      const transcurrido = ts - inicio;

      if (transcurrido >= DURACION_MS) {
        setActivo(false);
        return;
      }

      const restante = DURACION_MS - transcurrido;
      const opacidad = restante < DESVANECIDO_MS ? restante / DESVANECIDO_MS : 1;

      ctx.clearRect(0, 0, ancho, alto);
      ctx.globalAlpha = opacidad;

      // Un estallido cada ~650 ms, y ninguno en el último tramo para que la
      // pantalla quede limpia antes de desaparecer.
      if (ts - ultimoEstallido > 650 && restante > DESVANECIDO_MS + 600) {
        ultimoEstallido = ts;
        estallar(azar(0.15, 0.85) * ancho, azar(0.12, 0.5) * alto);
      }

      for (const g of globos) {
        g.y -= g.vy;
        if (g.y < -g.r * 3) g.y = alto + azar(g.r * 3, alto * 0.7);
        dibujarGlobo(g, ts);
      }

      chispas = chispas.filter((c) => c.vida > 0.02);
      for (const c of chispas) {
        c.vx *= 0.985;
        c.vy = c.vy * 0.985 + 0.035;
        c.x += c.vx;
        c.y += c.vy;
        c.vida -= 0.011;
        ctx.globalAlpha = opacidad * Math.max(c.vida, 0);
        ctx.fillStyle = c.color;
        ctx.beginPath();
        ctx.arc(c.x, c.y, 2.3, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      rafId = requestAnimationFrame(paso);
    };

    rafId = requestAnimationFrame(paso);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", ajustar);
    };
  }, [activo]);

  if (!activo) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 9998,
      }}
    />
  );
}
