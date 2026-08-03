"use client";

import { useEffect, useState } from "react";
import { THEME } from "@/lib/theme";
import { LAUNCH_AT_MS } from "@/lib/launch";

function calcularRestante(objetivoMs: number) {
  const total = Math.max(0, objetivoMs - Date.now());
  const dias = Math.floor(total / (1000 * 60 * 60 * 24));
  const horas = Math.floor((total / (1000 * 60 * 60)) % 24);
  const minutos = Math.floor((total / (1000 * 60)) % 60);
  const segundos = Math.floor((total / 1000) % 60);
  return { total, dias, horas, minutos, segundos };
}

export default function ComingSoonPage() {
  // Arrancamos en null para que el primer render (servidor y cliente) sea idéntico y
  // no haya "hydration mismatch"; el reloj se rellena en el efecto, ya en el cliente.
  const [t, setT] = useState<ReturnType<typeof calcularRestante> | null>(null);

  // Alta en la lista de espera. Sin librerías de formularios: es un campo.
  const [email, setEmail] = useState("");
  const [envio, setEnvio] = useState<"idle" | "enviando" | "ok" | "error">("idle");
  const [aviso, setAviso] = useState("");

  async function apuntarse(e: React.FormEvent) {
    e.preventDefault();
    if (envio === "enviando" || envio === "ok") return;

    setEnvio("enviando");
    setAviso("");
    try {
      const r = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setEnvio("ok");
        setAviso(d.mensaje || "¡Listo! En un minuto te llega tu acceso al correo.");
      } else {
        setEnvio("error");
        setAviso(d.error || "No pudimos guardarte. Inténtalo de nuevo.");
      }
    } catch {
      // Sin conexión o petición cortada. El usuario no tiene por qué saber
      // la diferencia: lo que necesita es saber que puede reintentar.
      setEnvio("error");
      setAviso("No hay conexión. Revisa tu internet e inténtalo de nuevo.");
    }
  }

  useEffect(() => {
    setT(calcularRestante(LAUNCH_AT_MS));
    const id = setInterval(() => {
      const r = calcularRestante(LAUNCH_AT_MS);
      setT(r);
      if (r.total <= 0) {
        clearInterval(id);
        // ¡Es la hora! El candado ya se abrió: mandamos a la app.
        window.location.href = "/";
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const dd = t ? String(t.dias) : "–";
  const hh = t ? String(t.horas).padStart(2, "0") : "–";
  const mm = t ? String(t.minutos).padStart(2, "0") : "–";
  const ss = t ? String(t.segundos).padStart(2, "0") : "–";

  const bloques = [
    { valor: dd, etiqueta: "Días" },
    { valor: hh, etiqueta: "Horas" },
    { valor: mm, etiqueta: "Min" },
    { valor: ss, etiqueta: "Seg" },
  ];

  // Los dos párrafos del mensaje comparten pinta; solo cambia el margen de abajo,
  // así que el estilo va en una constante en vez de repetirse copiado.
  const estiloParrafo: React.CSSProperties = {
    color: "rgba(255,255,255,0.9)",
    fontSize: 16,
    margin: "0 0 14px",
    width: "100%",
    maxWidth: 520,
    boxSizing: "border-box",
    lineHeight: 1.5,
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: `linear-gradient(160deg, ${THEME.primaryDark} 0%, ${THEME.primary} 55%, ${THEME.primaryLight} 135%)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
        padding: "40px 20px",
        textAlign: "center",
        overflowX: "hidden",
      }}
    >
      <img
        src="/logo-white.svg?v=2"
        alt="Colbisnes"
        style={{ height: 62, width: "auto", marginBottom: 30 }}
      />

      <p
        style={{
          color: "rgba(255,255,255,0.82)",
          fontSize: 14,
          fontWeight: 800,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          margin: "0 0 12px",
        }}
      >
        Acceso anticipado
      </p>
      <h1
        style={{
          color: "#fff",
          fontSize: "clamp(22px, 6.2vw, 30px)",
          fontWeight: 900,
          margin: "0 0 10px",
          width: "100%",
          maxWidth: 580,
          boxSizing: "border-box",
          lineHeight: 1.2,
        }}
      >
        Ya puedes entrar y publicar
      </h1>
      <p style={estiloParrafo}>
        Colbisnes es la tienda de segunda mano de Colombia donde puedes vender
        todo lo que ya no usas, pero con una gran diferencia: nadie te tumba. Tu
        dinero queda en custodia hasta que el trato se complete con éxito.
      </p>
      <p style={{ ...estiloParrafo, margin: "0 0 26px" }}>
        Déjanos tu correo y te llega tu acceso al instante. Arma tu perfil y
        publica desde hoy: así el 12, cuando se abran las compras, tu tienda ya
        está montada.
      </p>

      {/* Medios de pago. Los tres archivos ya viven en public/logos y son los
          mismos que usan la home (PAYMENT_METHODS) y el editor de perfil, así
          que no se introduce ningún asset nuevo.

          Nequi y Bre-B traen su propio fondo claro dentro del SVG; el de USDT
          es transparente. Para que los tres se vean parejos sobre el azul, cada
          uno va dentro de la misma pastilla blanca. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 42,
        }}
      >
        <span
          style={{
            color: "rgba(255,255,255,0.62)",
            fontSize: 11.5,
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            width: "100%",
            marginBottom: 2,
          }}
        >
          Pagos con
        </span>

        {[
          { src: "/logos/nequi.svg", alt: "Nequi" },
          { src: "/logos/breb.svg", alt: "Bre-B" },
          { src: "/logos/usdt.png", alt: "USDT" },
        ].map((m) => (
          <span
            key={m.alt}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#fff",
              borderRadius: 12,
              padding: "7px 12px",
              height: 38,
              boxSizing: "border-box",
              boxShadow: "0 6px 18px rgba(2,14,38,0.22)",
            }}
          >
            <img
              src={m.src}
              alt={m.alt}
              style={{ height: 22, width: "auto", display: "block" }}
            />
          </span>
        ))}
      </div>

      {/* Reloj regresivo.
          Desde el acceso anticipado (2026-08-03) el reloj YA NO cuenta para
          entrar —se entra hoy— sino para que se activen las compras. Sin este
          rótulo encima, un contador gigante sigue diciendo "vuelve luego", que
          es justo lo contrario de lo que queremos. */}
      <p
        style={{
          color: "rgba(255,255,255,0.72)",
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.06em",
          margin: "0 0 14px",
        }}
      >
        Faltan para que se abran las compras
      </p>
      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 34,
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        {bloques.map((b) => (
          <div
            key={b.etiqueta}
            style={{
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.25)",
              borderRadius: 18,
              padding: "18px 12px",
              minWidth: 80,
              boxShadow: "0 12px 34px rgba(0,0,0,0.20)",
              backdropFilter: "blur(4px)",
            }}
          >
            <div
              style={{
                color: "#fff",
                fontSize: 42,
                fontWeight: 900,
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {b.valor}
            </div>
            <div
              style={{
                color: "rgba(255,255,255,0.8)",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                marginTop: 8,
              }}
            >
              {b.etiqueta}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 9,
          background: "rgba(255,255,255,0.14)",
          border: "1px solid rgba(255,255,255,0.3)",
          borderRadius: 999,
          padding: "10px 20px",
        }}
      >
        <span style={{ fontSize: 16 }}>🗓️</span>
        <span style={{ color: "#fff", fontSize: 15, fontWeight: 700 }}>
          12 de agosto · 10:20 a.m. (hora de Colombia)
        </span>
      </div>

      {/* Captura de la lista de espera.
          Todo el tráfico que llegaba aquí antes se iba sin dejar contacto: había
          reloj y fecha, pero ninguna forma de decir "avísame". Esto alimenta la
          tabla Waitlist, que es de donde saca los destinatarios el script del
          correo de lanzamiento. */}
      <form
        onSubmit={apuntarse}
        style={{
          width: "100%",
          maxWidth: 440,
          marginTop: 34,
          boxSizing: "border-box",
        }}
      >
        <label
          htmlFor="waitlist-email"
          style={{
            display: "block",
            color: "rgba(255,255,255,0.9)",
            fontSize: 14,
            fontWeight: 700,
            marginBottom: 12,
          }}
        >
          Déjanos tu correo y te mandamos tu acceso
        </label>

        <div
          style={{
            display: "flex",
            gap: 9,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <input
            id="waitlist-email"
            type="email"
            required
            inputMode="email"
            autoComplete="email"
            placeholder="tu@correo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={envio === "enviando" || envio === "ok"}
            style={{
              flex: "1 1 220px",
              minWidth: 0,
              padding: "14px 16px",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.35)",
              background: "rgba(255,255,255,0.14)",
              color: "#fff",
              fontSize: 15,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          <button
            type="submit"
            disabled={envio === "enviando" || envio === "ok"}
            style={{
              flex: "0 0 auto",
              padding: "14px 24px",
              borderRadius: 14,
              border: "none",
              background: envio === "ok" ? "rgba(255,255,255,0.35)" : "#fff",
              color: envio === "ok" ? "#fff" : THEME.primaryDark,
              fontSize: 15,
              fontWeight: 800,
              cursor: envio === "enviando" || envio === "ok" ? "default" : "pointer",
              boxShadow: "0 8px 22px rgba(0,0,0,0.22)",
            }}
          >
            {envio === "enviando" ? "..." : envio === "ok" ? "✓ Mira tu correo" : "Quiero entrar"}
          </button>
        </div>

        {aviso && (
          <p
            role="status"
            style={{
              margin: "12px 0 0",
              fontSize: 13.5,
              fontWeight: 600,
              lineHeight: 1.45,
              color: envio === "ok" ? "#BBF7D0" : "#FECACA",
            }}
          >
            {aviso}
          </p>
        )}

        <p
          style={{
            margin: "10px 0 0",
            fontSize: 11.5,
            color: "rgba(255,255,255,0.55)",
            lineHeight: 1.5,
          }}
        >
          Te llega un correo con tu enlace de entrada. Ni spam ni se lo pasamos
          a nadie.
        </p>
      </form>

      {/* Firma del fundador, en su azul original. Se saca de la imagen escaneada
          recortando la silueta por inundación desde los bordes: así los brillos
          claros que caen DENTRO de un trazo no quedan como huecos transparentes.
          No se le toca el color, solo se le quita el fondo blanco.

          Va sin reducción de paleta: con 96 colores el degradado metálico se cortaba
          en bandas y parecía pixelada. Las dos sombras dan el relieve —una corta que
          la despega del fondo azul y otra amplia que aporta profundidad—. El ?v=2
          fuerza a los navegadores a bajar la versión nueva pese al mismo nombre. */}
      <img
        src="/firma-gustavo.png?v=3"
        alt="Firma de Gustavo Osorio, fundador de Colbisnes"
        style={{
          width: "min(340px, 78%)",
          height: "auto",
          marginTop: 46,
          // Dos sombras: una corta que despega la firma del fondo y otra amplia
          // que le da profundidad.
          //
          // A propósito NO se usa image-rendering: crisp-edges. Esa propiedad
          // apaga el remuestreo del navegador (pasa a vecino más cercano), y el
          // remuestreo es justamente lo que hace que un PNG de 1200 px se vea
          // limpio dentro de 340 px. Con crisp-edges los trazos finos y las
          // diagonales salen con escaleritas.
          filter:
            "drop-shadow(0 2px 3px rgba(2,14,38,0.45)) drop-shadow(0 8px 18px rgba(2,14,38,0.35))",
        }}
      />

      <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 16 }}>
        © 2026 Colbisnes · Compra y venta protegida
      </p>
    </div>
  );
}
