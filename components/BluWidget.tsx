"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import { THEME } from "@/lib/theme";
import { BLU_SALUDO_INICIAL, BLU_QUICK_REPLIES_DEFAULT } from "@/lib/bluFaq";

interface BluMsg {
  autor: "USUARIO" | "BLU";
  texto: string;
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
  const finRef = useRef<HTMLDivElement>(null);
  const cargoHistorial = useRef(false);

  // Si la ruta actual es /product/<id>, la usamos como contexto para Siames (escalamientos con producto)
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
    } catch {
      setMensajes(prev => [...prev, { autor: "BLU", texto: "Se me enredó un bigote 🐾 intenta de nuevo en un momento, o escribe \"hablar con soporte\"." }]);
    } finally {
      setEnviando(false);
    }
  }, [conversationId, productId, enviando]);

  return (
    <>
      {!abierto && (
        <button
          onClick={() => setAbierto(true)}
          aria-label="Abrir chat con Siames"
          style={{
            position: "fixed", right: 18, bottom: 18, zIndex: 1900,
            width: 62, height: 62, borderRadius: "50%", border: "none", cursor: "pointer",
            background: THEME.surfaceGradient, boxShadow: THEME.cardShadow,
            padding: 4, display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <img src="/siames-avatar.png" alt="Siames" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
          <span style={{ position: "absolute", right: 2, bottom: 2, width: 14, height: 14, borderRadius: "50%", background: THEME.success, border: "2.5px solid #fff" }} />
        </button>
      )}

      {abierto && (
        <div style={{
          position: "fixed", right: 18, bottom: 18, zIndex: 1900,
          width: "min(380px, 92vw)", height: "min(600px, 76vh)",
          background: THEME.surfaceGradient, borderRadius: 24, border: "1.5px solid transparent",
          boxShadow: THEME.cardShadow, display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            background: `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`,
            padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
          }}>
            <img src="/siames-avatar.png" alt="Siames" style={{ width: 38, height: 38, borderRadius: "50%", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, color: "#fff", fontWeight: 800, fontSize: 14.5 }}>Siames 🐾</p>
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
                  Siames está escribiendo…
                </div>
              </div>
            )}
            <div ref={finRef} />
          </div>

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
              placeholder="Escríbele a Siames…"
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
