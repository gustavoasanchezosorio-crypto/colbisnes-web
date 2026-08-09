"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import { THEME } from "@/lib/theme";
import { BLU_SALUDO_INICIAL, BLU_QUICK_REPLIES_DEFAULT } from "@/lib/bluFaq";

interface BluMsg {
  autor: "USUARIO" | "BLU";
  texto: string;
}

/** Lo que manda el endpoint cuando hay que poner al cliente en contacto con una persona.
 *  Solo el enlace: el numero NO se escribe en pantalla (ver el boton mas abajo). */
interface ContactoWhatsapp {
  url: string;
}

const STORAGE_KEY = "blu_conversation_id";

export default function BluWidget() {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<BluMsg[]>([{ autor: "BLU", texto: BLU_SALUDO_INICIAL }]);
  const [quickReplies, setQuickReplies] = useState<string[]>(BLU_QUICK_REPLIES_DEFAULT);
  const [input, setInput] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  // Una vez que Chucho ofrece hablar con una persona, el botón verde se queda a la vista
  // hasta que se cierre el chat. Si desapareciera al mensaje siguiente, el cliente que
  // duda un momento y escribe otra cosa perdería la única salida que tiene hacia alguien.
  const [whatsapp, setWhatsapp] = useState<ContactoWhatsapp | null>(null);
  const finRef = useRef<HTMLDivElement>(null);
  const cargoHistorial = useRef(false);

  // Si la ruta actual es /product/<id>, la usamos como contexto para Chucho Bot (escalamientos con producto)
  const productId = pathname?.startsWith("/product/") ? pathname.split("/")[2] : null;

  useEffect(() => {
    if (cargoHistorial.current) return;
    cargoHistorial.current = true;
    const guardado = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (!guardado) return;
    setConversationId(guardado);
    fetch(`/api/blu/chat?conversationId=${encodeURIComponent(guardado)}`)
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d.mensajes) && d.mensajes.length > 0) {
          setMensajes(d.mensajes.map((m: any) => ({ autor: m.autor, texto: m.texto })));
          if (Array.isArray(d.quickReplies)) setQuickReplies(d.quickReplies);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (abierto) finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes, abierto, enviando]);

  const enviarMensaje = useCallback(async (texto: string) => {
    const limpio = texto.trim();
    if (!limpio || enviando) return;
    setMensajes(prev => [...prev, { autor: "USUARIO", texto: limpio }]);
    setInput("");
    setQuickReplies([]);
    setEnviando(true);
    try {
      const res = await fetch("/api/blu/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ conversationId, mensaje: limpio, productId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Error");
      if (data.conversationId) {
        setConversationId(data.conversationId);
        if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, data.conversationId);
      }
      setMensajes(prev => [...prev, { autor: "BLU", texto: data.respuesta || "..." }]);
      setQuickReplies(Array.isArray(data.quickReplies) ? data.quickReplies : []);
      if (data.whatsapp?.url) setWhatsapp(data.whatsapp);
    } catch {
      setMensajes(prev => [...prev, { autor: "BLU", texto: "Uy, no me pude conectar 🐾 intenta otra vez en un momentico, o escribe \"hablar con soporte\" y te paso con una persona." }]);
    } finally {
      setEnviando(false);
    }
  }, [conversationId, productId, enviando]);

  // En la pantalla "Próximamente" (previa al lanzamiento) ocultamos el chat de soporte
  // para que el candado se vea limpio. Todos los hooks ya se ejecutaron arriba, así que
  // este return condicional no rompe las reglas de hooks.
  if (pathname === "/coming-soon") return null;

  return (
    <>
      {!abierto && (
        <button
          onClick={() => setAbierto(true)}
          aria-label="Abrir chat con Chucho Bot"
          // La clase la lee globals.css para subir el botón cuando en esa pantalla hay
          // barra de compra fija (solo pasa en la ficha de producto vista en teléfono).
          className="blu-lanzador"
          style={{
            position: "fixed", right: 18, bottom: "calc(18px + env(safe-area-inset-bottom))", zIndex: 1900,
            width: 62, height: 62, borderRadius: "50%", border: "none", cursor: "pointer",
            background: THEME.surfaceGradient, boxShadow: THEME.cardShadow,
            padding: 4, display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <img src="/chucho-avatar.png" alt="Chucho Bot" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
          <span style={{ position: "absolute", right: 2, bottom: 2, width: 14, height: 14, borderRadius: "50%", background: THEME.success, border: "2.5px solid #fff" }} />
        </button>
      )}

      {abierto && (
        // El alto sale de .blu-panel (globals.css) y NO de un style en línea a propósito:
        // hacen falta dos declaraciones (76vh de respaldo y 76dvh real) y un objeto de
        // estilo de React no admite la misma clave dos veces. Con 76vh a secas, en el
        // teléfono el encabezado del panel se salía por arriba de la pantalla.
        <div
          className="blu-panel"
          style={{
            position: "fixed", right: 18, bottom: "calc(18px + env(safe-area-inset-bottom))", zIndex: 1900,
            width: "min(380px, 92vw)",
            background: THEME.surfaceGradient, borderRadius: 24, border: "1.5px solid transparent",
            boxShadow: THEME.cardShadow, display: "flex", flexDirection: "column", overflow: "hidden",
          }}
        >
          {/* Header */}
          <div style={{
            background: `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`,
            padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
          }}>
            <img src="/chucho-avatar.png" alt="Chucho Bot" style={{ width: 38, height: 38, borderRadius: "50%", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, color: "#fff", fontWeight: 800, fontSize: 14.5 }}>Chucho Bot 🐾</p>
              <p style={{ margin: 0, color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: 600 }}>Asistente de Colbisnes</p>
            </div>
            <button onClick={() => setAbierto(false)} aria-label="Cerrar chat" style={{ width: 28, height: 28, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.2)", color: "#fff", fontSize: 15, cursor: "pointer", flexShrink: 0 }}>×</button>
          </div>

          {/* Mensajes */}
          <div style={{ flex: 1, overflowY: "auto", padding: "14px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
            {mensajes.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: m.autor === "USUARIO" ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "82%", padding: "9px 13px", fontSize: 13, lineHeight: 1.45, whiteSpace: "pre-wrap",
                  background: m.autor === "USUARIO" ? `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary})` : THEME.surfaceAlt,
                  color: m.autor === "USUARIO" ? "#fff" : THEME.text,
                  borderRadius: m.autor === "USUARIO" ? "14px 4px 14px 14px" : "4px 14px 14px 14px",
                  fontWeight: m.autor === "USUARIO" ? 600 : 500,
                }}>
                  {m.texto}
                </div>
              </div>
            ))}
            {enviando && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{ padding: "9px 13px", borderRadius: "4px 14px 14px 14px", background: THEME.surfaceAlt, color: THEME.muted, fontSize: 13 }}>
                  Chucho Bot está escribiendo…
                </div>
              </div>
            )}
            <div ref={finRef} />
          </div>

          {/* Salida hacia una persona de verdad.
              Va aquí arriba, pegado al campo de escribir, porque es la acción más
              importante del widget cuando alguien ya dijo que quiere hablar con alguien.
              No se usa el logotipo de WhatsApp —es marca de Meta— sino su verde y el
              nombre escrito, que sí es uso legítimo y se reconoce igual de rápido.

              El número NO se escribe en pantalla a propósito: si queda a la vista, la
              gente lo copia y escribe por fuera de Colbisnes, y ahí ya no hay pedido,
              ni historial, ni forma de respaldar a nadie si algo sale mal. Tocando el
              botón el chat se abre igual, pero pasando por aquí. */}
          {whatsapp && (
            <div style={{ padding: "0 12px 10px", flexShrink: 0 }}>
              <a
                href={whatsapp.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  background: "#25D366", color: "#fff", textDecoration: "none",
                  borderRadius: 14, padding: "11px 14px", fontSize: 13, fontWeight: 800,
                  boxShadow: "0 4px 14px rgba(37,211,102,0.35)",
                }}
              >
                💬 Escríbenos por WhatsApp
              </a>
              <p style={{ margin: "6px 0 0", textAlign: "center", fontSize: 11, color: THEME.muted, fontWeight: 600 }}>
                Te contesta una persona del equipo
              </p>
            </div>
          )}

          {/* Quick replies */}
          {quickReplies.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 12px 10px", flexShrink: 0 }}>
              {quickReplies.map((q, i) => (
                <button
                  key={i}
                  onClick={() => enviarMensaje(q)}
                  disabled={enviando}
                  style={{
                    border: `1.5px solid ${THEME.border}`, background: THEME.surfaceAlt, color: THEME.primary,
                    borderRadius: 14, padding: "6px 10px", fontSize: 11.5, fontWeight: 700, cursor: enviando ? "default" : "pointer",
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <form
            onSubmit={e => { e.preventDefault(); enviarMensaje(input); }}
            style={{ display: "flex", gap: 8, padding: "10px 12px 12px", flexShrink: 0, borderTop: `1px solid ${THEME.border}` }}
          >
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Escríbele a Chucho Bot…"
              disabled={enviando}
              style={{ flex: 1, padding: "10px 14px", borderRadius: 14, border: `1.5px solid ${THEME.border}`, background: THEME.surfaceAlt, color: THEME.text, fontSize: 13, minWidth: 0 }}
            />
            <button
              type="submit"
              disabled={enviando || !input.trim()}
              style={{
                width: 40, height: 40, borderRadius: "50%", border: "none", flexShrink: 0,
                background: enviando || !input.trim() ? "#e2e8f0" : `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary})`,
                color: "#fff", fontSize: 15, cursor: enviando || !input.trim() ? "default" : "pointer",
              }}
              aria-label="Enviar mensaje"
            >
              ➤
            </button>
          </form>
        </div>
      )}
    </>
  );
}
