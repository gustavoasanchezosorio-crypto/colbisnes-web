"use client";
import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { THEME } from "@/lib/theme";

const AZUL = THEME.primary;

interface Message {
  id: string;
  content: string;
  fromUserId: string;
  toUserId: string;
  productId?: string;
  read: boolean;
  createdAt: string;
  fromUser: { id: string; name: string; image?: string };
  toUser: { id: string; name: string; image?: string };
}

interface Conversacion {
  userId: string;
  userName: string;
  userImage?: string;
  productId?: string;
  productTitle?: string;
  ultimoMensaje: string;
  fecha: string;
  noLeidos: number;
}

export default function MensajesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [conversaciones, setConversaciones] = useState<Conversacion[]>([]);
  const [convActiva, setConvActiva] = useState<Conversacion | null>(null);
  const [mensajes, setMensajes] = useState<Message[]>([]);
  const [nuevoMensaje, setNuevoMensaje] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [cargando, setCargando] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/login");
  }, [status]);

  useEffect(() => {
    if (session?.user?.id) cargarConversaciones();
  }, [session]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes]);

  useEffect(() => {
    if (!convActiva) return;
    cargarMensajes(convActiva);
    const intervalo = setInterval(() => cargarMensajes(convActiva), 3000);
    return () => clearInterval(intervalo);
  }, [convActiva]);

  const cargarConversaciones = async () => {
    try {
      const res = await fetch("/api/messages/conversaciones");
      if (res.ok) setConversaciones(await res.json());
    } catch(e) {}
    finally { setCargando(false); }
  };

  const cargarMensajes = async (conv: Conversacion) => {
    try {
      const params = new URLSearchParams({ withUserId: conv.userId });
      if (conv.productId) params.append("productId", conv.productId);
      const res = await fetch(`/api/messages?${params}`);
      if (res.ok) { setMensajes(await res.json()); cargarConversaciones(); }
    } catch(e) {}
  };

  const enviarMensaje = async () => {
    if (!nuevoMensaje.trim() || !convActiva) return;
    setEnviando(true);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toUserId: convActiva.userId, productId: convActiva.productId, content: nuevoMensaje.trim() })
      });
      if (res.ok) { setNuevoMensaje(""); await cargarMensajes(convActiva); }
    } catch(e) {}
    finally { setEnviando(false); }
  };

  const avatar = (nombre: string, imagen?: string) => (
    imagen
      ? <img src={imagen} alt={nombre} style={{width:"40px",height:"40px",borderRadius:"50%",objectFit:"cover"}} />
      : <div style={{width:"40px",height:"40px",borderRadius:"50%",background:`linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`,display:"flex",
          alignItems:"center",justifyContent:"center",color:"white",fontWeight:"bold",fontSize:"1rem",flexShrink:0}}>
          {(nombre||"?")[0].toUpperCase()}
        </div>
  );

  if (status === "loading" || cargando) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",color:THEME.primary,fontFamily:"sans-serif",background:THEME.background}}>
      Cargando...
    </div>
  );

  return (
    <div style={{fontFamily:"sans-serif",height:"100vh",display:"flex",flexDirection:"column",backgroundColor:THEME.background}}>
      <div style={{background:`linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`,color:"white",padding:"1rem 1.5rem",display:"flex",alignItems:"center",gap:"1rem",position:"relative"}}>
        <button onClick={() => convActiva ? (setConvActiva(null), setMensajes([])) : router.push("/")}
          style={{background:"none",border:"none",color:"white",fontSize:"1.5rem",cursor:"pointer",position:"absolute",left:"1.5rem",top:"50%",transform:"translateY(-50%)"}}>←</button>
        <h1 style={{margin:0,fontSize:"1.2rem",fontWeight:"bold",width:"100%",textAlign:"center"}}>
          {convActiva ? `Chat con ${convActiva.userName}` : "Mis mensajes"}
        </h1>
      </div>

      {!convActiva ? (
        <div style={{flex:1,overflowY:"auto",padding:"1rem"}}>
          {conversaciones.length === 0 ? (
            <div style={{textAlign:"center",padding:"3rem",color:THEME.muted}}>
              <p style={{fontSize:"2rem",margin:"0 0 0.5rem"}}>💬</p>
              <p style={{fontWeight:"bold",color:THEME.textSoft}}>No tienes mensajes aún</p>
              <p style={{fontSize:"0.9rem"}}>Cuando alguien te escriba o tú escribas a un vendedor, aparecerá aquí.</p>
            </div>
          ) : (
            conversaciones.map((conv, i) => (
              <div key={i} onClick={() => setConvActiva(conv)}
                style={{
                  background: conv.noLeidos > 0
                    ? `linear-gradient(#eef3fb,#eef3fb) padding-box, ${THEME.metalBorder} border-box`
                    : THEME.surfaceGradient,
                  borderRadius:"12px",padding:"1rem",marginBottom:"0.75rem",
                  cursor:"pointer",display:"flex",alignItems:"center",gap:"0.75rem",
                  boxShadow:THEME.cardShadow,border:"1.5px solid transparent"}}>
                {avatar(conv.userName, conv.userImage)}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <p style={{margin:0,fontWeight:"bold",fontSize:"0.95rem",color:THEME.text}}>{conv.userName}</p>
                    <span style={{fontSize:"0.75rem",color:THEME.muted}}>{new Date(conv.fecha).toLocaleDateString("es-CO")}</span>
                  </div>
                  {conv.productTitle && (
                    <p style={{margin:"0.1rem 0",fontSize:"0.75rem",color:THEME.primary}}>📦 {conv.productTitle}</p>
                  )}
                  <p style={{margin:0,fontSize:"0.85rem",color:THEME.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {conv.ultimoMensaje}
                  </p>
                </div>
                {conv.noLeidos > 0 && (
                  <span style={{backgroundColor:AZUL,color:"white",borderRadius:"50%",width:"22px",height:"22px",
                    display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.75rem",fontWeight:"bold",flexShrink:0}}>
                    {conv.noLeidos}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          {convActiva.productTitle && (
            <div style={{background:"#f4f7fb",padding:"0.75rem 1rem",borderBottom:`1px solid ${THEME.border}`}}>
              <p style={{margin:0,fontSize:"0.85rem",color:THEME.primary}}>
                📦 <strong>{convActiva.productTitle}</strong>
                <a href={`/product/${convActiva.productId}`} style={{marginLeft:"0.5rem",color:THEME.primary,fontSize:"0.8rem"}}>Ver producto →</a>
              </p>
            </div>
          )}
          <div style={{flex:1,overflowY:"auto",padding:"1rem",display:"flex",flexDirection:"column",gap:"0.5rem"}}>
            {mensajes.map((msg) => {
              const esMio = msg.fromUserId === session?.user?.id;
              return (
                <div key={msg.id} style={{display:"flex",justifyContent:esMio?"flex-end":"flex-start",alignItems:"flex-end",gap:"0.5rem"}}>
                  {!esMio && avatar(msg.fromUser.name, msg.fromUser.image)}
                  <div style={{maxWidth:"70%",background:esMio?`linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`:"#f4f7fb",color:esMio?"white":THEME.text,
                    borderRadius:esMio?"16px 16px 4px 16px":"16px 16px 16px 4px",padding:"0.75rem 1rem",
                    boxShadow:esMio?`0 4px 14px ${AZUL}44`:"none",border:esMio?"none":`1px solid ${THEME.border}`}}>
                    <p style={{margin:0,fontSize:"0.95rem",lineHeight:"1.4"}}>{msg.content}</p>
                    <p style={{margin:"0.3rem 0 0",fontSize:"0.7rem",opacity:0.7,textAlign:"right"}}>
                      {new Date(msg.createdAt).toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"})}
                    </p>
                  </div>
                  {esMio && avatar(msg.fromUser.name, msg.fromUser.image)}
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
          <div style={{padding:"1rem",background:"#ffffff",borderTop:`1px solid ${THEME.border}`,display:"flex",gap:"0.75rem",alignItems:"flex-end"}}>
            <textarea
              value={nuevoMensaje}
              onChange={e => setNuevoMensaje(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviarMensaje(); } }}
              placeholder="Escribe un mensaje..."
              spellCheck lang="es"
              style={{flex:1,padding:"0.75rem",borderRadius:"12px",border:`1px solid ${THEME.border}`,resize:"none",
                fontSize:"0.95rem",outline:"none",maxHeight:"120px",fontFamily:"sans-serif",background:"#ffffff",color:THEME.text}}
              rows={1}
            />
            <button onClick={enviarMensaje} disabled={enviando || !nuevoMensaje.trim()}
              style={{background:nuevoMensaje.trim()?`linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`:"#e2e8f0",color:"white",border:"none",
                borderRadius:"12px",padding:"0.75rem 1.25rem",cursor:nuevoMensaje.trim()?"pointer":"not-allowed",
                fontWeight:"bold",fontSize:"0.9rem"}}>
              {enviando ? "..." : "Enviar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
