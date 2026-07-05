"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useProductSocket } from "@/lib/useSocket";
import TrackingOverlay from "@/components/TrackingOverlay";
import TrustBadge from "@/components/TrustBadge";
import PagarComisionNequiModal from "@/components/PagarComisionNequiModal";
import { THEME } from "@/lib/theme";

interface Product {
  id: string; title: string; description: string; priceCOP: number;
  city: string; condition: string; status: string; sellerId: string;
  tipoEntrega: string; precioEnvio?: number; featuredUntil?: string | null;
  seller: { id: string; name: string; email: string; image?: string | null; kycStatus?: string };
  images: { url: string }[];
  acceptedOfferId?: string; paymentExpiresAt?: string;
}
interface Offer {
  id: string; amountCOP: number; message?: string; status: string;
  userId: string; user?: { name: string }; createdAt: string;
}
interface Message {
  id: string; content: string; createdAt: string;
  fromUserId: string; toUserId: string;
}
// Shape from /api/messages/conversaciones
interface Conv {
  userId: string; userName: string; userImage?: string | null;
  productId: string; ultimoMensaje: string;
  noLeidos: number;
}

const AZUL   = THEME.primary;
const DORADO = THEME.gold;
const VERDE  = "#22c55e";
const MORADO = "#8B4FDB";
const BORDE_ORO = THEME.goldSoft; // detalle dorado puntual (CTAs especiales)

const glass = (alpha = 0.7, blur = 20): React.CSSProperties => ({
  background: `rgba(255,255,255,${(0.6 + alpha * 0.4).toFixed(2)})`,
  backdropFilter: `blur(${blur}px) saturate(1.3)`,
  WebkitBackdropFilter: `blur(${blur}px) saturate(1.3)`,
  border: `1px solid ${THEME.border}`,
  boxShadow: "0 8px 24px rgba(10,46,107,0.10)",
});

export default function ProductPageClient({ productId }: { productId: string }) {
  const { data: session } = useSession();
  const router = useRouter();
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [product, setProduct]     = useState<Product | null>(null);
  const [offers, setOffers]       = useState<Offer[]>([]);
  const [imagenActual, setImagenActual] = useState(0);
  const [cargando, setCargando]   = useState(true);
  const [countdown, setCountdown] = useState(0);
  const [esFavorito, setEsFavorito]     = useState(false);
  const [favoritosCount, setFavCount]   = useState(0);
  const [tabEntrega, setTabEntrega]     = useState<"ENVIO"|"EN_PERSONA">("ENVIO");
  const [descripcionAbierta, setDescAbierta]     = useState(true);
  const [caracteristicasAbiertas, setCaracAbiertas] = useState(true);

  // KYC gate modal
  const [mostrarKycModal, setMostrarKycModal] = useState(false);

  // modals
  const [mostrarOferta, setMostrarOferta] = useState(false);
  const [montoOferta, setMontoOferta]     = useState("");
  const [montoOfertaDisplay, setMontoOfertaDisplay] = useState("");
  const [mensajeOferta, setMensajeOferta] = useState("");
  const [enviandoOferta, setEnviandoOferta] = useState(false);
  const [errorOferta, setErrorOferta]     = useState("");

  // chat
  const [mostrarChat, setMostrarChat]   = useState(false);
  const [chatConUserId, setChatConId]   = useState("");
  const [chatConNombre, setChatNombre]  = useState("");
  const [chatConImagen, setChatImagen]  = useState<string|null>(null);
  const [mensajes, setMensajes]         = useState<Message[]>([]);
  const [inputChat, setInputChat]       = useState("");
  const [enviandoChat, setEnviandoChat] = useState(false);
  const [convs, setConvs]               = useState<Conv[]>([]);
  const [vistaConvs, setVistaConvs]     = useState(true);
  const [noLeidosTotal, setNoLeidos]    = useState(0);
  const [ultimoMensajeId, setUltimoMsgId] = useState<string | null>(null);
  const [hayMensajeNuevo, setHayNuevo]  = useState(false);
  const [ordenActiva, setOrdenActiva]   = useState<{id:string;estado:string;buyerEmail:string;metodoPago?:string;numeroGuia?:string;comisionReservaCOP?:number;comisionReservaPagada?:boolean;comisionReservaComprobanteUrl?:string;nequiNumero?:string|null;fechaLimiteEnvio?:string;envioPenalizado?:boolean} | null>(null);
  const [mostrarPagarComision, setMostrarPagarComision] = useState(false);
  const searchParams = useSearchParams();
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(
    () => searchParams?.get("orderId") ?? null
  );

  const [mostrarDestacadoOk, setMostrarDestacadoOk] = useState(false);
  useEffect(() => {
    if (searchParams?.get("destacado") === "ok") {
      setMostrarDestacadoOk(true);
      const t = setTimeout(() => setMostrarDestacadoOk(false), 6000);
      return () => clearTimeout(t);
    }
  }, [searchParams]);

  const esVendedor  = session?.user?.id === product?.sellerId;
  const estaDestacado = !!product?.featuredUntil && new Date(product.featuredUntil) > new Date();
  const esComprador = !esVendedor && !!session?.user?.email &&
    (ordenActiva?.buyerEmail?.toLowerCase() === session.user.email.toLowerCase() ||
     offers.some(o => o.status === "ACCEPTED" && o.userId === session?.user?.id));
  const miOferta    = offers.find(o => o.userId === session?.user?.id);

  useProductSocket(productId, useCallback((data: any) => {
    if (data.productId === productId) { cargarProducto(); cargarOfertas(); }
  }, [productId]));

  useEffect(() => {
    if (!product?.paymentExpiresAt) return;
    const tick = () => setCountdown(Math.max(0, Math.floor((new Date(product.paymentExpiresAt!).getTime() - Date.now()) / 1000)));
    tick(); const iv = setInterval(tick, 1000); return () => clearInterval(iv);
  }, [product?.paymentExpiresAt]);

  useEffect(() => { cargarProducto(); cargarFavoritos(); cargarOrden(); }, [productId]);
  useEffect(() => {
    if (product) { cargarOfertas(); setTabEntrega(product.tipoEntrega === "EN_PERSONA" ? "EN_PERSONA" : "ENVIO"); }
  }, [product?.id]);
  useEffect(() => {
    const iv = setInterval(() => { cargarProducto(); cargarOfertas(); cargarOrden(); }, 5000);
    return () => clearInterval(iv);
  }, [productId]);
  useEffect(() => {
    if (!mostrarChat || !chatConUserId) return;
    cargarMensajes();
    const iv = setInterval(cargarMensajes, 2000);
    return () => clearInterval(iv);
  }, [mostrarChat, chatConUserId]);
  useEffect(() => {
    if (!esVendedor || !product) return;
    cargarConvsSeller();
    const iv = setInterval(cargarConvsSeller, 3000);
    return () => clearInterval(iv);
  }, [esVendedor, product?.id]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [mensajes]);

  const cargarProducto = async () => {
    try {
      const res = await fetch(`/api/products/${productId}`);
      if (!res.ok) { router.push("/"); return; }
      setProduct(await res.json());
    } catch { router.push("/"); }
    finally { setCargando(false); }
  };
  const cargarOfertas = async () => {
    try { const d = await (await fetch(`/api/offers?productId=${productId}`)).json(); setOffers(Array.isArray(d) ? d : []); } catch {}
  };
  const cargarOrden = async () => {
    try {
      const d = await (await fetch(`/api/orders/por-producto?productId=${productId}`)).json();
      if (d.orden) setOrdenActiva(d.orden);
    } catch {}
  };
  const cargarFavoritos = async () => {
    try { const d = await (await fetch(`/api/favorites?productId=${productId}`)).json(); setEsFavorito(d.esFavorito); setFavCount(d.count); } catch {}
  };
  const toggleFavorito = async () => {
    if (!session?.user) { router.push("/auth/login"); return; }
    try { const d = await (await fetch("/api/favorites",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({productId})})).json(); setEsFavorito(d.esFavorito); setFavCount(d.count); } catch {}
  };
  const cargarMensajes = async () => {
    if (!chatConUserId) return;
    try {
      const d = await (await fetch(`/api/messages?withUserId=${chatConUserId}&productId=${productId}`)).json();
      if (Array.isArray(d)) {
        setMensajes(prev => {
          const ultimoNuevo = d[d.length - 1];
          const ultimoPrev  = prev[prev.length - 1];
          if (ultimoNuevo && ultimoPrev && ultimoNuevo.id !== ultimoPrev.id && ultimoNuevo.fromUserId === chatConUserId) {
            setHayNuevo(true);
            setTimeout(() => setHayNuevo(false), 3000);
          }
          return d;
        });
      }
    } catch {}
  };
  const cargarConvsSeller = async () => {
    try {
      const res = await fetch(`/api/messages/conversaciones`);
      if (!res.ok) return;
      const all: Conv[] = await res.json();
      const del = all.filter(c => c.productId === productId);
      setConvs(del);
      setNoLeidos(del.reduce((s, c) => s + (c.noLeidos || 0), 0));
    } catch {}
  };

  const abrirChatComprador = () => {
    if (!session?.user) { router.push("/auth/login"); return; }
    if (!product) return;
    setChatConId(product.sellerId);
    setChatNombre(product.seller.name || "Vendedor");
    setChatImagen(product.seller.image || null);
    setVistaConvs(false);
    setMostrarChat(true);
  };
  const abrirChatVendedor = (conv: Conv) => {
    setChatConId(conv.userId);
    setChatNombre(conv.userName || "Comprador");
    setChatImagen(conv.userImage || null);
    setVistaConvs(false);
    cargarMensajes();
  };
  const abrirPanelVendedor = () => { setVistaConvs(true); setMensajes([]); setMostrarChat(true); cargarConvsSeller(); };

  // Helper: maneja respuestas con kycRequired
  const handleKycRequired = (d: any): boolean => {
    if (d?.kycRequired) { setMostrarKycModal(true); return true; }
    return false;
  };

  const enviarMensaje = async () => {
    if (!inputChat.trim() || !chatConUserId) return;
    setEnviandoChat(true);
    const t = inputChat.trim(); setInputChat("");
    try {
      const res = await fetch("/api/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({toUserId:chatConUserId,productId,content:t})});
      const d = await res.json().catch(() => ({}));
      if (handleKycRequired(d)) return;
      await cargarMensajes();
    } catch {}
    finally { setEnviandoChat(false); }
  };
  const enviarOferta = async () => {
    if (!montoOferta) { setErrorOferta("Ingresa un monto"); return; }
    if (product && Number(montoOferta) > product.priceCOP) { setErrorOferta("No puede superar el precio"); return; }
    setEnviandoOferta(true); setErrorOferta("");
    try {
      const res = await fetch("/api/offers",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({productId,amountCOP:Number(montoOferta),message:mensajeOferta})});
      const d = await res.json();
      if (handleKycRequired(d)) { setMostrarOferta(false); return; }
      if (!res.ok) { setErrorOferta(d.error||"Error"); return; }
      setMostrarOferta(false); setMontoOferta(""); cargarOfertas();
    } catch { setErrorOferta("Error de conexion"); }
    finally { setEnviandoOferta(false); }
  };
  const responderOferta = async (offerId: string, status: "ACCEPTED"|"REJECTED") => {
    try {
      const res = await fetch("/api/offers",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({offerId,status})});
      const d = await res.json().catch(() => ({}));
      if (handleKycRequired(d)) return;
      if (res.ok) { cargarProducto(); cargarOfertas(); }
    } catch {}
  };
  const irACheckout = () => {
    if (!session?.user) { router.push("/auth/login"); return; }
    // El checkout redirigirá a /kyc si el usuario no está verificado
    router.push(`/checkout/${productId}`);
  };

  const colorEstado: Record<string,string> = { AVAILABLE:VERDE, PAYMENT_PENDING:"#E07B00", IN_ESCROW:MORADO, SOLD:"#555" };
  const labelEstado: Record<string,string>  = { AVAILABLE:"Disponible", PAYMENT_PENDING:"Pago pendiente", IN_ESCROW:"En custodia", SOLD:"Vendido" };

  const overlay: React.CSSProperties = {
    position:"fixed",inset:0,background:"rgba(10,20,40,0.55)",
    backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",
    zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem",
  };
  const modalBase: React.CSSProperties = {
    background: THEME.surfaceGradient,
    border: "1.5px solid transparent",
    boxShadow: THEME.cardShadow,
    borderRadius:"24px",padding:"0",width:"100%",maxWidth:"480px",
    height:"600px",display:"flex",flexDirection:"column",overflow:"hidden",
  };
  const inp: React.CSSProperties = {
    width:"100%",padding:"0.7rem 1rem",borderRadius:"10px",
    border:`1.5px solid ${THEME.border}`,fontSize:"0.92rem",
    boxSizing:"border-box",marginTop:"0.35rem",
    outline:"none",background:"#ffffff",color: THEME.text,
  };

  if (cargando) return (
    <div style={{textAlign:"center",padding:"5rem",color:THEME.primary,fontFamily:"sans-serif"}}>
      <div style={{width:40,height:40,border:`3px solid rgba(14,86,192,0.15)`,borderTopColor:THEME.primary,borderRadius:"50%",margin:"0 auto 1rem",animation:"spin 0.8s linear infinite"}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      Cargando...
    </div>
  );
  if (!product) return <div style={{textAlign:"center",padding:"4rem"}}>Producto no encontrado</div>;

  const tieneEnvio   = product.tipoEntrega === "ENVIO"      || product.tipoEntrega === "AMBOS";
  const tienePersona = product.tipoEntrega === "EN_PERSONA" || product.tipoEntrega === "AMBOS";
  const disponible   = product.status === "AVAILABLE";

  return (
    <div style={{maxWidth:"960px",margin:"0 auto",padding:"1rem 1rem 4.5rem",fontFamily:"-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif",color:THEME.text}}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes msgPulse{0%,100%{transform:scale(1);box-shadow:0 3px 12px rgba(0,88,159,0.33)}50%{transform:scale(1.04);box-shadow:0 5px 20px rgba(0,88,159,0.55)}}
        .thumb{transition:transform 0.15s,border 0.15s}
        .thumb:hover{transform:scale(1.06)}
        .nav-arrow{opacity:0;transition:opacity 0.2s}
        .img-wrap:hover .nav-arrow{opacity:1}
        .prod-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:1.5rem;align-items:start}
        @media(max-width:680px){.prod-grid{grid-template-columns:1fr}}
      `}</style>

      <div className="prod-grid">

        {/* ══ GALERÍA (sticky) ════════════════════════════════════════════════ */}
        <div style={{position:"sticky",top:"1rem"}}>
          <div className="img-wrap" style={{position:"relative",borderRadius:"16px",overflow:"hidden",aspectRatio:"4/3",background:"#eef2f7"}}>
            {product.images?.length > 0 ? (
              <img src={product.images[imagenActual]?.url} alt={product.title}
                style={{width:"100%",height:"100%",objectFit:"contain",display:"block"}} />
            ) : (
              <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"3rem",color:"rgba(13,27,42,0.25)"}}>📷</div>
            )}

            {/* Flechas */}
            {product.images.length > 1 && <>
              <button className="nav-arrow" onClick={() => setImagenActual(p=>(p-1+product.images.length)%product.images.length)}
                style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",width:36,height:36,borderRadius:"50%",
                  border:"none",background:"rgba(0,0,0,0.45)",color:"white",fontSize:18,cursor:"pointer",zIndex:4,display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
              <button className="nav-arrow" onClick={() => setImagenActual(p=>(p+1)%product.images.length)}
                style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",width:36,height:36,borderRadius:"50%",
                  border:"none",background:"rgba(0,0,0,0.45)",color:"white",fontSize:18,cursor:"pointer",zIndex:4,display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
              {/* Puntos */}
              <div style={{position:"absolute",bottom:10,left:"50%",transform:"translateX(-50%)",display:"flex",gap:5,zIndex:4}}>
                {product.images.map((_,i)=>(
                  <div key={i} onClick={()=>setImagenActual(i)}
                    style={{width:i===imagenActual?18:7,height:7,borderRadius:4,cursor:"pointer",
                      background:i===imagenActual?AZUL:"rgba(255,255,255,0.7)",transition:"all 0.2s"}}/>
                ))}
              </div>
            </>}

            {/* Favorito - solo si NO es el vendedor */}
            {!esVendedor && (
              <button onClick={toggleFavorito} style={{
                position:"absolute",top:10,right:10,
                background:"#ffffff",borderRadius:"20px",padding:"5px 11px",
                cursor:"pointer",display:"flex",alignItems:"center",gap:5,
                fontSize:13,fontWeight:700,color:THEME.text,zIndex:4,
                border: esFavorito ? "1.5px solid #ef4444" : "1.5px solid rgba(0,0,0,0.08)",
                boxShadow: esFavorito ? "0 2px 10px rgba(0,0,0,0.18), 0 0 0 3px rgba(239,68,68,0.15)" : "0 2px 10px rgba(0,0,0,0.18)",
              }}>
                <span style={{fontSize:16, filter:"drop-shadow(0 1px 1px rgba(0,0,0,0.25))"}}>{esFavorito?"❤️":"🤍"}</span>
                {favoritosCount > 0 && <span>{favoritosCount}</span>}
              </button>
            )}

            {/* Contador foto */}
            {product.images.length > 1 && (
              <span style={{position:"absolute",bottom:10,right:10,...glass(0.7,12),borderRadius:"16px",
                padding:"3px 9px",fontSize:"0.75rem",fontWeight:700,color:THEME.text,zIndex:4}}>
                {imagenActual+1}/{product.images.length}
              </span>
            )}
          </div>

          {/* Miniaturas */}
          {product.images.length > 1 && (
            <div style={{display:"flex",gap:"0.5rem",marginTop:"0.6rem",flexWrap:"wrap"}}>
              {product.images.map((img,i)=>(
                <img key={i} src={img.url} alt="" onClick={()=>setImagenActual(i)} className="thumb"
                  style={{width:58,height:58,objectFit:"cover",borderRadius:10,cursor:"pointer",
                    border:`2.5px solid ${i===imagenActual?AZUL:"transparent"}`,
                    boxShadow:i===imagenActual?`0 0 0 2px ${AZUL}33`:"none"}}/>
              ))}
            </div>
          )}
        </div>

        {/* ══ INFO (orden psicológico: AIDA) ══════════════════════════════════ */}
        <div style={{display:"flex",flexDirection:"column",gap:"0.65rem"}}>

          {/* 1. ATENCIÓN — Título + estado */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:"0.5rem"}}>
            <h1 style={{fontSize:"1.45rem",fontWeight:"800",margin:0,lineHeight:1.2,color:THEME.text,letterSpacing:"-0.3px"}}>
              {product.title}
            </h1>
            <span style={{background:colorEstado[product.status],color:"white",padding:"0.28rem 0.8rem",
              borderRadius:"20px",fontSize:"0.7rem",fontWeight:"700",whiteSpace:"nowrap",flexShrink:0}}>
              {labelEstado[product.status]}
            </span>
          </div>

          {/* Tags atributos */}
          <div style={{display:"flex",flexWrap:"wrap",gap:"0.35rem"}}>
            {[product.condition, product.city,
              product.tipoEntrega==="ENVIO"?"Con envío":product.tipoEntrega==="EN_PERSONA"?"En persona":"Envío y persona"
            ].map((t,i)=>(
              <span key={i} style={{background:"#eef3fb",color:THEME.textSoft,padding:"0.2rem 0.65rem",
                borderRadius:"20px",fontSize:"0.75rem",fontWeight:"600",border:`1px solid ${THEME.border}`}}>{t}</span>
            ))}
          </div>

          {/* 2. INTERÉS — Precio destacado */}
          <div style={{display:"flex",alignItems:"baseline",gap:"0.4rem"}}>
            <span style={{fontSize:"2rem",fontWeight:"900",color:THEME.primary,letterSpacing:"-1px"}}>
              ${product.priceCOP.toLocaleString("es-CO")}
            </span>
            <span style={{fontSize:"0.85rem",fontWeight:"600",color:THEME.muted}}>COP</span>
          </div>

          {/* 3. DESEO — Vendedor + garantía compactos */}
          <div style={{...glass(0.65,18),borderRadius:"12px",padding:"0.65rem 0.9rem",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:"0.65rem"}}>
              {product.seller.image ? (
                <img src={product.seller.image} alt={product.seller.name||"Vendedor"}
                  style={{width:38,height:38,borderRadius:"50%",objectFit:"cover",flexShrink:0,border:`2px solid ${AZUL}33`}}
                  onError={e=>{(e.currentTarget as HTMLImageElement).style.display="none";}} />
              ) : (
                <div style={{width:38,height:38,borderRadius:"50%",background:`linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`,
                  display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:"800",fontSize:"1rem",flexShrink:0}}>
                  {(product.seller.name||"?")[0].toUpperCase()}
                </div>
              )}
              <div>
                <div style={{display:"flex",alignItems:"center",gap:5}}>
                  <p style={{margin:0,fontWeight:"700",fontSize:"0.88rem",color:THEME.text}}>{product.seller.name||"Anónimo"}</p>
                  {(product.seller as any).kycStatus === "approved" && (
                    <span title="Identidad verificada por Colbisnes" style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:16,height:16,borderRadius:"50%",background:THEME.primary,color:"#fff",fontSize:9,fontWeight:900,flexShrink:0}}>✓</span>
                  )}
                </div>
                <a href={`/user/${product.sellerId}`} style={{color:THEME.primary,fontSize:"0.74rem",textDecoration:"none",fontWeight:"500"}}>Ver perfil</a>
                <div style={{marginTop:3}}><TrustBadge userId={product.sellerId} compact /></div>
              </div>
            </div>
            {!esVendedor && session?.user && (
              <button onClick={abrirChatComprador} style={{
                background:`linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`,color:"white",border:"none",
                padding:"0.45rem 1rem",borderRadius:"18px",cursor:"pointer",fontWeight:"700",fontSize:"0.83rem",
                boxShadow:`0 3px 12px ${AZUL}44`,
              }}>Chat</button>
            )}
            {esVendedor && (
              <button onClick={abrirPanelVendedor} style={{
                background: noLeidosTotal > 0 ? `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})` : "#f4f7fb",
                color: noLeidosTotal > 0 ? "white" : THEME.primary,
                border: noLeidosTotal > 0 ? "none" : `1.5px solid ${THEME.border}`,
                padding:"0.45rem 1rem",borderRadius:"18px",cursor:"pointer",fontWeight:"700",fontSize:"0.83rem",
                display:"flex",alignItems:"center",gap:6,
                boxShadow: noLeidosTotal > 0 ? `0 3px 12px ${AZUL}55` : "none",
                animation: noLeidosTotal > 0 ? "msgPulse 1.5s ease-in-out infinite" : "none",
                transition:"all 0.3s",
              }}>
                💬 Mensajes
                {noLeidosTotal > 0 && (
                  <span style={{background:"#e53e3e",color:"white",borderRadius:"50%",
                    width:20,height:20,fontSize:"0.7rem",fontWeight:"800",
                    display:"flex",alignItems:"center",justifyContent:"center"}}>
                    {noLeidosTotal}
                  </span>
                )}
              </button>
            )}
          </div>

          {mostrarDestacadoOk && (
            <div style={{background:"rgba(34,197,94,0.13)",border:"1px solid rgba(34,197,94,0.42)",borderRadius:"12px",padding:"0.7rem 0.9rem",display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:18}}>✅</span>
              <p style={{margin:0,fontSize:"0.82rem",color:"#15803d",fontWeight:700}}>¡Pago recibido! Tu producto quedará destacado en cuanto Wompi confirme el pago (unos segundos).</p>
            </div>
          )}

          {esVendedor && (
            estaDestacado ? (
              <div style={{background:"linear-gradient(135deg,rgba(245,158,11,0.14),rgba(217,119,6,0.08))",border:"1px solid rgba(217,119,6,0.35)",borderRadius:"12px",padding:"0.7rem 0.9rem",display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:18}}>🚀</span>
                <p style={{margin:0,fontSize:"0.82rem",color:"#B45309",fontWeight:700}}>
                  Destacado hasta el {new Date(product!.featuredUntil!).toLocaleDateString("es-CO",{day:"numeric",month:"long"})}
                </p>
              </div>
            ) : (
              <a href={`/api/checkout/destacar?productoId=${productId}`} style={{textDecoration:"none"}}>
                <div style={{background:"linear-gradient(135deg,rgba(245,158,11,0.14),rgba(217,119,6,0.08))",border:"1px solid rgba(217,119,6,0.35)",borderRadius:"12px",padding:"0.7rem 0.9rem",display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
                  <span style={{fontSize:18}}>🚀</span>
                  <div style={{flex:1}}>
                    <p style={{margin:0,fontSize:"0.85rem",color:"#B45309",fontWeight:800}}>Destacar este producto</p>
                    <p style={{margin:0,fontSize:"0.75rem",color:THEME.muted}}>Aparece primero en el inicio y búsquedas por 7 días — $8.000 COP</p>
                  </div>
                </div>
              </a>
            )
          )}

          {/* Entrega inline — sin card pesada */}
          {(tieneEnvio || tienePersona) && (
            <div style={{background:"#f4f7fb",border:`1px solid ${THEME.border}`,borderRadius:"12px",overflow:"hidden"}}>
              {product.tipoEntrega==="AMBOS" && (
                <div style={{display:"flex",borderBottom:`1px solid ${THEME.border}`}}>
                  {(["ENVIO","EN_PERSONA"] as const).map(t=>(
                    <button key={t} onClick={()=>setTabEntrega(t)}
                      style={{flex:1,padding:"0.5rem",border:"none",cursor:"pointer",fontWeight:"700",fontSize:"0.8rem",
                        background:tabEntrega===t?AZUL:"transparent",color:tabEntrega===t?"white":THEME.muted,transition:"all 0.2s"}}>
                      {t==="ENVIO"?"Con envío":"En persona"}
                    </button>
                  ))}
                </div>
              )}
              <div style={{padding:"0.65rem 0.9rem",display:"flex",flexDirection:"column",gap:"0.5rem"}}>
                {tabEntrega==="ENVIO" && tieneEnvio && <>
                  <MiniRow icon="🚚" text={product.precioEnvio?`Envío desde $${product.precioEnvio.toLocaleString("es-CO")} COP`:"Envío incluido"} sub="A domicilio"/>
                  <MiniRow icon="🔒" text="Protección Colbisnes" sub="Pago seguro"/>
                </>}
                {tabEntrega==="EN_PERSONA" && tienePersona && <>
                  <MiniRow icon="📍" text={product.city} sub="Coordina con el vendedor"/>
                  <MiniRow icon="🔒" text="Reserva pagando" sub="Paga y recoge"/>
                </>}
              </div>
            </div>
          )}

          {/* 4. ACCIÓN — CTAs justo después del precio/vendedor */}
          {disponible && !esVendedor && session?.user && (
            <div style={{display:"flex",gap:"0.5rem"}}>
              {!miOferta && (
                <button onClick={()=>setMostrarOferta(true)} style={{
                  flex:1,background:"#ffffff",color:DORADO,border:`2px solid ${DORADO}`,
                  borderRadius:"12px",padding:"0.8rem",cursor:"pointer",fontWeight:"800",fontSize:"0.93rem",
                }}>Hacer oferta</button>
              )}
              <button onClick={irACheckout} style={{
                flex:2,background:`linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`,color:"white",border:"none",
                borderRadius:"12px",padding:"0.8rem",cursor:"pointer",fontWeight:"800",fontSize:"0.93rem",
                boxShadow:`0 5px 18px ${AZUL}44`,
              }}>Comprar</button>
            </div>
          )}
          {miOferta && disponible && (
            <div style={{background:"rgba(199,154,46,0.10)",border:`1.5px solid rgba(199,154,46,0.4)`,borderRadius:"12px",padding:"0.75rem 1rem"}}>
              <p style={{margin:0,fontWeight:"700",color:"#8a6a1f",fontSize:"0.88rem"}}>Tu oferta enviada</p>
              <p style={{margin:"0.2rem 0 0",color:THEME.textSoft,fontSize:"0.88rem"}}>${miOferta.amountCOP.toLocaleString("es-CO")} COP — {miOferta.status}</p>
              <button onClick={irACheckout} style={{background:AZUL,color:"white",border:"none",borderRadius:"10px",
                padding:"0.6rem 1rem",cursor:"pointer",fontWeight:"700",marginTop:"0.6rem",width:"100%",fontSize:"0.9rem"}}>
                Comprar al precio original
              </button>
            </div>
          )}
          {product.status==="PAYMENT_PENDING" && esComprador && (
            <div style={{background:"rgba(224,123,0,0.10)",border:`1.5px solid rgba(224,123,0,0.35)`,borderRadius:"12px",padding:"0.75rem 1rem"}}>
              <p style={{fontWeight:"700",color:"#b45309",margin:"0 0 0.3rem",fontSize:"0.9rem"}}>Tu oferta fue aceptada</p>
              {countdown>0 && <p style={{margin:"0 0 0.5rem",fontSize:"0.82rem",color:THEME.muted}}>Vence en: {Math.floor(countdown/60)}:{String(countdown%60).padStart(2,"0")} min</p>}
              <button onClick={irACheckout} style={{background:AZUL,color:"white",border:"none",borderRadius:"10px",
                padding:"0.7rem",cursor:"pointer",fontWeight:"800",width:"100%",fontSize:"0.93rem"}}>Pagar ahora</button>
            </div>
          )}
          {product.status==="PAYMENT_PENDING" && !esVendedor && !esComprador && session?.user && (
            <div style={{
              ...glass(0.22, 28),
              border: `1.5px solid ${BORDE_ORO}`,
              borderRadius: "20px",
              padding: "1.5rem 1.25rem 1.25rem",
              textAlign: "center",
              boxShadow: "0 8px 32px rgba(31,107,255,0.10), 0 1.5px 8px rgba(0,0,0,0.07)",
              position: "relative",
              overflow: "hidden",
            }}>
              {/* fondo decorativo desenfocado */}
              <div style={{
                position:"absolute",inset:0,
                background:"linear-gradient(135deg,rgba(255,205,0,0.13) 0%,rgba(31,107,255,0.10) 100%)",
                borderRadius:"20px",pointerEvents:"none",
              }}/>
              {/* taza de café translúcida */}
              <div style={{
                fontSize: "2.8rem",
                marginBottom: "0.6rem",
                opacity: 0.55,
                filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.18))",
                lineHeight: 1,
              }}>☕</div>
              <p style={{
                margin: "0 0 0.4rem",
                lineHeight: 1.15,
                position:"relative",
              }}>
                <span style={{ display: "block", fontWeight: 900, fontSize: "1.05rem", color: "#1a2a4a", letterSpacing: "-0.3px" }}>Aquí se está cerrando un</span>
                <span style={{ display: "block", fontWeight: 800, fontSize: "1.45rem", color: "#1F6BFF", letterSpacing: "-1.1px", marginTop: 2 }}>bisnes</span>
              </p>
              <p style={{
                fontSize: "0.85rem",
                color: "#3a4a6a",
                margin: "0 0 0.9rem",
                lineHeight: 1.55,
                position:"relative",
              }}>
                Tómate un tintico{" "}
                {countdown > 0 && (
                  <strong style={{color: THEME.gold, fontVariantNumeric:"tabular-nums"}}>
                    {String(Math.floor(countdown/60)).padStart(2,"0")}:{String(countdown%60).padStart(2,"0")}
                  </strong>
                )}
                {countdown > 0 ? " — si no se realiza el pago, el producto estará disponible de nuevo." : " — el producto estará disponible de nuevo pronto."}
              </p>
              <div style={{
                display:"inline-flex",alignItems:"center",gap:"6px",
                background:"rgba(20,102,204,0.12)",
                border:"1px solid rgba(20,102,204,0.30)",
                borderRadius:"30px",
                padding:"5px 14px",
                fontSize:"0.78rem",
                fontWeight:700,
                color:"#0a4fa0",
                position:"relative",
              }}>
                <span style={{width:7,height:7,borderRadius:"50%",background:"#0a4fa0",display:"inline-block",opacity:0.8}}/>
                Colbisnes protege esta transacción
              </div>
            </div>
          )}
          {product.status==="IN_ESCROW" && ordenActiva?.estado==="ESPERANDO_COMISION" && esComprador && (
            <div style={{background:"rgba(147,51,234,0.08)",border:"1.5px solid rgba(147,51,234,0.3)",borderRadius:"12px",padding:"0.75rem 1rem"}}>
              <p style={{fontWeight:"700",color:"#7e22ce",margin:"0 0 0.4rem"}}>💜 Falta pagar la comisión de reserva</p>
              <p style={{fontSize:"0.82rem",color:THEME.textSoft,margin:"0 0 0.7rem"}}>
                {ordenActiva?.comisionReservaComprobanteUrl
                  ? "Ya enviaste tu comprobante. Un administrador lo confirmará en breve para que el vendedor pueda despachar."
                  : "Para garantizar tu compra contra entrega, paga por Nequi la comisión de Colbisnes antes de que el vendedor envíe el producto."}
              </p>
              {ordenActiva?.fechaLimiteEnvio && (
                <p style={{fontSize:"0.76rem",color:"#7e22ce",margin:"0 0 0.7rem",fontWeight:600,lineHeight:1.4}}>
                  ⏰ El vendedor tiene hasta el {new Date(ordenActiva.fechaLimiteEnvio).toLocaleString("es-CO")} para despachar (24h hábiles desde que se creó tu orden). Ese plazo corre aunque tu pago esté pendiente — si no despacha a tiempo, se bloquea su cuenta y gestionamos la devolución de tu comisión.
                </p>
              )}
              {!ordenActiva?.comisionReservaComprobanteUrl && (
                <button onClick={()=>setMostrarPagarComision(true)}
                  style={{background:"#7e22ce",color:"white",border:"none",borderRadius:"10px",padding:"0.7rem",cursor:"pointer",fontWeight:"800",width:"100%",fontSize:"0.93rem",boxShadow:"0 4px 14px rgba(126,34,206,0.35)"}}>
                  Pagar comisión de reserva
                </button>
              )}
            </div>
          )}
          {product.status==="IN_ESCROW" && ordenActiva?.estado==="ESPERANDO_COMISION" && esVendedor && (
            <div style={{background:"#f4f7fb",border:`1.5px solid ${THEME.border}`,borderRadius:"12px",padding:"0.75rem 1rem"}}>
              <p style={{fontWeight:"700",color:THEME.text,margin:"0 0 0.25rem"}}>⏳ Esperando pago de la comisión de reserva</p>
              <p style={{fontSize:"0.82rem",color:THEME.muted,margin:0}}>El comprador aún no ha pagado la comisión de reserva a Colbisnes. Aún no puedes registrar el envío — te avisaremos apenas se confirme.</p>
              {ordenActiva?.fechaLimiteEnvio && (
                <p style={{fontSize:"0.78rem",color:"#b45309",margin:"0.5rem 0 0",fontWeight:700,lineHeight:1.4}}>
                  ⏰ Ojo: tu plazo de 24h hábiles para despachar ya está corriendo (vence: {new Date(ordenActiva.fechaLimiteEnvio).toLocaleString("es-CO")}), aunque todavía no puedas registrar el envío. Si se vence sin despacho, tu cuenta queda bloqueada y baja tu puntaje.
                </p>
              )}
            </div>
          )}
          {product.status==="IN_ESCROW" && ordenActiva?.estado && ordenActiva.estado!=="ESPERANDO_COMISION" && esVendedor && (
            <div style={{background:"rgba(34,197,94,0.10)",border:"1.5px solid rgba(34,197,94,0.35)",borderRadius:"12px",padding:"0.75rem 1rem"}}>
              <p style={{fontWeight:"700",color:"#15803d",margin:"0 0 0.25rem"}}>💰 Pago recibido en custodia</p>
              <p style={{fontSize:"0.82rem",color:THEME.textSoft,margin:0}}>
                {ordenActiva?.numeroGuia
                  ? `Guía registrada: ${ordenActiva.numeroGuia}. Esperando confirmación del comprador.`
                  : "Registra el envío para que el comprador pueda confirmar la entrega."}
              </p>
              {!ordenActiva?.numeroGuia && ordenActiva?.fechaLimiteEnvio && (
                <p style={{fontSize:"0.78rem",color:"#b45309",margin:"0.4rem 0 0",fontWeight:700}}>
                  ⏰ Plazo de despacho: {new Date(ordenActiva.fechaLimiteEnvio).toLocaleString("es-CO")} (24h hábiles 8am-8pm). Si no envías a tiempo, tu cuenta se bloquea y baja tu puntaje.
                </p>
              )}
            </div>
          )}
          {product.status==="IN_ESCROW" && (!ordenActiva?.estado || ordenActiva.estado!=="ESPERANDO_COMISION") && esComprador && (
            <div style={{background:"rgba(34,197,94,0.10)",border:"1.5px solid rgba(34,197,94,0.35)",borderRadius:"12px",padding:"0.75rem 1rem"}}>
              <p style={{fontWeight:"700",color:"#15803d",margin:"0 0 0.4rem"}}>✅ ¿Recibiste tu producto?</p>
              <p style={{fontSize:"0.82rem",color:THEME.textSoft,margin:"0 0 0.7rem"}}>
                {ordenActiva?.metodoPago === "CONTRA_ENTREGA"
                  ? "Recuerda: pagas el producto en efectivo directo al mensajero al recibirlo. Confirma aquí una vez lo tengas en tus manos."
                  : "Confirma la entrega para liberar el pago al vendedor."}
              </p>
              <button onClick={async()=>{
                const r=await fetch("/api/payments/confirm-delivery",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({productId})});
                if(r.ok){cargarProducto();cargarOrden();}
              }}
                style={{background:VERDE,color:"white",border:"none",borderRadius:"10px",padding:"0.7rem",cursor:"pointer",fontWeight:"800",width:"100%",fontSize:"0.93rem",
                  boxShadow:`0 4px 14px ${VERDE}44`}}>
                {ordenActiva?.metodoPago === "CONTRA_ENTREGA" ? "Confirmar entrega" : "Confirmar entrega y liberar pago"}
              </button>
            </div>
          )}
          {product.status==="IN_ESCROW" && !esVendedor && !esComprador && session?.user && (
            <div style={{background:"#f4f7fb",border:`1.5px solid ${THEME.border}`,borderRadius:"12px",padding:"0.75rem 1rem"}}>
              <p style={{fontSize:"0.85rem",color:THEME.muted,margin:0,textAlign:"center"}}>🔒 Este producto está en proceso de entrega</p>
            </div>
          )}
          {product.status==="SOLD" && (
            <span style={{display:"inline-block",background:"#555",color:"white",padding:"0.5rem 1rem",borderRadius:"20px",fontSize:"0.88rem"}}>Vendido</span>
          )}
          {!session?.user && disponible && (
            <a href="/auth/login" style={{display:"block",background:`linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`,color:"white",
              borderRadius:"12px",padding:"0.85rem",textAlign:"center",textDecoration:"none",fontWeight:"800",fontSize:"0.95rem"}}>
              Inicia sesión para comprar
            </a>
          )}

          {/* Descripción colapsable */}
          <Acordeon titulo="Descripción" abierto={descripcionAbierta} toggle={()=>setDescAbierta(v=>!v)}>
            <p style={{lineHeight:1.7,color:THEME.textSoft,margin:0,fontSize:"0.9rem",whiteSpace:"pre-line"}}>{product.description}</p>
          </Acordeon>

          {/* Características colapsable */}
          <Acordeon titulo="Características" abierto={caracteristicasAbiertas} toggle={()=>setCaracAbiertas(v=>!v)}>
            {[
              ["Condición",product.condition],
              ["Ciudad",product.city],
              ["Entrega",product.tipoEntrega==="ENVIO"?"Con envío":product.tipoEntrega==="EN_PERSONA"?"En persona":"Envío y en persona"],
              ...(product.precioEnvio?[["Costo de envío",`$${product.precioEnvio.toLocaleString("es-CO")} COP`]]:[]),
            ].map(([l,v],i,a)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"0.5rem 0",borderBottom:i<a.length-1?`1px solid ${THEME.border}`:"none"}}>
                <span style={{color:THEME.muted,fontSize:"0.85rem"}}>{l}</span>
                <span style={{fontWeight:"700",fontSize:"0.85rem",color:THEME.text}}>{v}</span>
              </div>
            ))}
          </Acordeon>
        </div>
      </div>

      {/* ══ OFERTAS (vendedor) ════════════════════════════════════════════════ */}
      {esVendedor && offers.length > 0 && (
        <div style={{marginTop:"1.5rem"}}>
          <h2 style={{fontSize:"1.1rem",fontWeight:"800",marginBottom:"0.75rem",color:THEME.text,textAlign:"center"}}>Ofertas recibidas</h2>
          {offers.map(o=>(
            <div key={o.id} style={{
              background:o.status==="ACCEPTED"?"rgba(34,197,94,0.10)":o.status==="REJECTED"?"rgba(239,68,68,0.10)":"#f4f7fb",
              border:`1px solid ${o.status==="ACCEPTED"?"rgba(34,197,94,0.35)":o.status==="REJECTED"?"rgba(239,68,68,0.35)":THEME.border}`,
              borderRadius:"12px",padding:"0.85rem 1rem",marginBottom:"0.4rem"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <p style={{margin:0,fontWeight:"700",color:THEME.text}}>${o.amountCOP.toLocaleString("es-CO")} COP</p>
                  <p style={{margin:"0.15rem 0 0",fontSize:"0.8rem",color:THEME.muted}}>
                    {o.user?.name||"Comprador"} — {new Date(o.createdAt).toLocaleDateString("es-CO")}
                  </p>
                  {o.message && <p style={{margin:"0.2rem 0 0",fontStyle:"italic",fontSize:"0.85rem",color:THEME.textSoft}}>"{o.message}"</p>}
                </div>
                <div style={{display:"flex",gap:"0.4rem"}}>
                  {o.status==="PENDING" && disponible && <>
                    <button onClick={()=>responderOferta(o.id,"ACCEPTED")} style={{background:VERDE,color:"white",border:"none",padding:"0.4rem 0.8rem",borderRadius:"8px",cursor:"pointer",fontWeight:"700",fontSize:"0.85rem"}}>Aceptar</button>
                    <button onClick={()=>responderOferta(o.id,"REJECTED")} style={{background:"#e53e3e",color:"white",border:"none",padding:"0.4rem 0.8rem",borderRadius:"8px",cursor:"pointer",fontWeight:"700",fontSize:"0.85rem"}}>Rechazar</button>
                  </>}
                  {o.status!=="PENDING" && (
                    <span style={{background:o.status==="ACCEPTED"?VERDE:"#e53e3e",color:"white",padding:"0.2rem 0.6rem",borderRadius:"6px",fontSize:"0.78rem"}}>
                      {o.status==="ACCEPTED"?"Aceptada":"Rechazada"}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══ BARRA FIJA ════════════════════════════════════════════════════════ */}
      {disponible && !esVendedor && (
        <div style={{position:"fixed",bottom:0,left:0,right:0,...glass(0.9,28),
          borderTop:"1px solid rgba(0,88,159,0.1)",padding:"0.75rem 1.25rem",
          display:"flex",gap:"0.6rem",zIndex:900}}>
          {session?.user ? (
            <>
              {!miOferta && (
                <button onClick={()=>setMostrarOferta(true)} style={{
                  flex:1,background:"#ffffff",color:DORADO,border:`2px solid ${DORADO}`,
                  borderRadius:"24px",padding:"0.8rem",cursor:"pointer",fontWeight:"800",fontSize:"0.93rem",
                }}>Hacer oferta</button>
              )}
              <button onClick={irACheckout} style={{
                flex:2,background:`linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`,color:"white",border:"none",
                borderRadius:"24px",padding:"0.8rem",cursor:"pointer",fontWeight:"800",fontSize:"0.93rem",
                boxShadow:`0 5px 20px ${AZUL}44`,
              }}>Comprar</button>
            </>
          ) : (
            <a href="/auth/login" style={{flex:1,background:`linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`,color:"white",
              borderRadius:"24px",padding:"0.8rem",textAlign:"center",textDecoration:"none",fontWeight:"800",fontSize:"0.93rem",display:"block"}}>
              Inicia sesión para comprar
            </a>
          )}
        </div>
      )}

      {/* ══ MODAL OFERTA ══════════════════════════════════════════════════════ */}
      {mostrarOferta && (
        <div style={overlay} onClick={e=>e.target===e.currentTarget&&setMostrarOferta(false)}>
          <div style={{...modalBase,height:"auto",padding:"1.75rem"}}>
            <div style={{position:"relative",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1rem"}}>
              <h2 style={{margin:0,fontWeight:"800",color:THEME.text,width:"100%",textAlign:"center"}}>Hacer oferta</h2>
              <button onClick={()=>setMostrarOferta(false)} style={{background:"#f4f7fb",border:"none",borderRadius:"50%",width:32,height:32,cursor:"pointer",fontSize:"1rem",color:THEME.muted,position:"absolute",right:0,top:"50%",transform:"translateY(-50%)"}}>✕</button>
            </div>
            <p style={{color:THEME.muted,margin:"0 0 1rem",fontSize:"0.85rem"}}>{product.title} — ${product.priceCOP.toLocaleString("es-CO")} COP</p>
            <label style={{fontWeight:"700",fontSize:"0.85rem",color:THEME.text}}>Monto (COP)</label>
            <input style={inp} type="text" inputMode="numeric" value={montoOfertaDisplay}
              onChange={e=>{
                const raw = e.target.value.replace(/\./g,"").replace(/[^0-9]/g,"");
                setMontoOferta(raw);
                setMontoOfertaDisplay(raw ? Number(raw).toLocaleString("es-CO") : "");
              }}
              placeholder={`Máximo $${product.priceCOP.toLocaleString("es-CO")}`}/>
            <label style={{fontWeight:"700",fontSize:"0.85rem",marginTop:"0.75rem",display:"block",color:THEME.text}}>Mensaje (opcional)</label>
            <textarea style={{...inp,height:"75px",resize:"none",marginTop:"0.35rem"}} value={mensajeOferta} onChange={e=>setMensajeOferta(e.target.value)} placeholder="Cuéntale algo al vendedor..." spellCheck lang="es"/>
            {errorOferta && <p style={{color:"#e53e3e",fontSize:"0.85rem",margin:"0.4rem 0"}}>{errorOferta}</p>}
            <button disabled={enviandoOferta} onClick={enviarOferta}
              style={{background:enviandoOferta?"rgba(199,154,46,0.35)":`linear-gradient(135deg,${DORADO},#E6B800)`,color:"#1a1200",border:"none",
                borderRadius:"12px",padding:"0.85rem",cursor:enviandoOferta?"not-allowed":"pointer",fontWeight:"800",width:"100%",marginTop:"1rem",fontSize:"0.95rem"}}>
              {enviandoOferta?"Enviando...":"Enviar oferta"}
            </button>
            <button style={{background:"none",border:"none",color:THEME.muted,cursor:"pointer",width:"100%",padding:"0.6rem",marginTop:"0.2rem",fontWeight:"600"}} onClick={()=>setMostrarOferta(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* ══ PANEL CHAT LIQUID GLASS ════════════════════════════════════════════ */}
      {mostrarChat && (
        <div style={overlay} onClick={e=>e.target===e.currentTarget&&setMostrarChat(false)}>
          <div style={modalBase} onClick={e=>e.stopPropagation()}>
            {esVendedor && vistaConvs ? (
              /* Lista conversaciones vendedor */
              <>
                <div style={{position:"relative",padding:"1rem 1.25rem 0.75rem",borderBottom:`1px solid ${THEME.border}`,flexShrink:0,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <h2 style={{margin:0,fontWeight:"800",fontSize:"1.05rem",color:THEME.text,width:"100%",textAlign:"center"}}>Mensajes del producto</h2>
                  <button onClick={()=>setMostrarChat(false)} style={{background:"#f4f7fb",border:"none",borderRadius:"50%",width:32,height:32,cursor:"pointer",fontSize:"1rem",color:THEME.muted,position:"absolute",right:"1.25rem",top:"50%",transform:"translateY(-50%)"}}>✕</button>
                </div>
                <div style={{flex:1,overflowY:"auto",padding:"0.75rem"}}>
                  {convs.length===0 ? (
                    <div style={{textAlign:"center",padding:"2rem",color:THEME.muted}}>
                      <p style={{fontSize:"2rem",margin:"0 0 0.5rem"}}>💬</p>
                      <p style={{fontSize:"0.85rem"}}>Aún no tienes mensajes aquí.</p>
                    </div>
                  ) : convs.map((c,i)=>(
                    <button key={i} onClick={()=>abrirChatVendedor(c)} style={{
                      width:"100%",display:"flex",alignItems:"center",gap:"0.75rem",
                      padding:"0.75rem",borderRadius:"14px",
                      border:`1px solid ${c.noLeidos>0?"rgba(20,102,204,0.35)":THEME.border}`,
                      background:c.noLeidos>0?"rgba(20,102,204,0.10)":"#f4f7fb",
                      cursor:"pointer",marginBottom:"0.4rem",textAlign:"left",
                    }}>
                      {c.userImage ? (
                        <img src={c.userImage} alt={c.userName}
                          style={{width:40,height:40,borderRadius:"50%",objectFit:"cover",flexShrink:0,border:`2px solid ${AZUL}22`}}
                          onError={e=>{(e.currentTarget as HTMLImageElement).style.display="none";}} />
                      ) : (
                        <div style={{width:40,height:40,borderRadius:"50%",background:`linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`,
                          display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:"800",flexShrink:0}}>
                          {(c.userName||"?")[0].toUpperCase()}
                        </div>
                      )}
                      <div style={{flex:1,minWidth:0}}>
                        <p style={{margin:0,fontWeight:"700",fontSize:"0.9rem",color:THEME.text}}>{c.userName||"Comprador"}</p>
                        <p style={{margin:"0.1rem 0 0",fontSize:"0.78rem",color:THEME.muted,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.ultimoMensaje||"..."}</p>
                      </div>
                      {c.noLeidos>0 && (
                        <span style={{background:AZUL,color:"white",borderRadius:"50%",width:22,height:22,
                          fontSize:"0.7rem",fontWeight:"800",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                          {c.noLeidos}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              /* Chat activo */
              <>
                <div style={{padding:"0.85rem 1.25rem",borderBottom:`1px solid ${THEME.border}`,
                  display:"flex",alignItems:"center",gap:"0.75rem",flexShrink:0}}>
                  {esVendedor && (
                    <button onClick={()=>setVistaConvs(true)} style={{background:"none",border:"none",cursor:"pointer",color:THEME.primary,fontSize:"1.4rem",padding:"0 0.2rem"}}>‹</button>
                  )}
                  {chatConImagen ? (
                    <img src={chatConImagen} alt={chatConNombre}
                      style={{width:34,height:34,borderRadius:"50%",objectFit:"cover",flexShrink:0,border:`2px solid ${AZUL}33`}}
                      onError={e=>{(e.currentTarget as HTMLImageElement).style.display="none";}} />
                  ) : (
                    <div style={{width:34,height:34,borderRadius:"50%",background:`linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`,
                      display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:"800",flexShrink:0}}>
                      {chatConNombre[0]?.toUpperCase()||"?"}
                    </div>
                  )}
                  <div style={{flex:1}}>
                    <p style={{margin:0,fontWeight:"700",fontSize:"0.92rem",color:THEME.text}}>{chatConNombre}</p>
                    <p style={{margin:0,fontSize:"0.73rem",color:hayMensajeNuevo?"#16a34a":THEME.muted,
                      fontWeight:hayMensajeNuevo?"700":"400",transition:"color 0.3s"}}>
                      {hayMensajeNuevo ? "🟢 Mensaje nuevo" : product.title}
                    </p>
                  </div>
                  <button onClick={()=>setMostrarChat(false)} style={{background:"#f4f7fb",border:"none",borderRadius:"50%",width:32,height:32,cursor:"pointer",fontSize:"1rem",color:THEME.muted}}>✕</button>
                </div>

                <div style={{flex:1,overflowY:"auto",padding:"0.85rem",display:"flex",flexDirection:"column",gap:"0.45rem"}}>
                  {mensajes.length===0 && (
                    <div style={{textAlign:"center",color:THEME.muted,padding:"2rem"}}>
                      <p style={{fontSize:"2rem",margin:"0 0 0.4rem"}}>💬</p>
                      <p style={{fontSize:"0.85rem"}}>Inicia la conversación</p>
                    </div>
                  )}
                  {mensajes.map(m=>{
                    const mio = m.fromUserId===session?.user?.id;
                    return (
                      <div key={m.id} style={{display:"flex",justifyContent:mio?"flex-end":"flex-start",animation:"fadeIn 0.2s"}}>
                        <div style={{
                          maxWidth:"74%",padding:"0.6rem 0.95rem",
                          borderRadius:mio?"18px 18px 4px 18px":"18px 18px 18px 4px",
                          background:mio?`linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`:"#f4f7fb",
                          color:mio?"white":THEME.text,
                          boxShadow:mio?`0 4px 14px ${AZUL}44`:"none",
                          border:mio?"none":`1px solid ${THEME.border}`,
                          fontSize:"0.88rem",lineHeight:1.5,
                        }}>
                          {m.content}
                          <p style={{margin:"0.2rem 0 0",fontSize:"0.66rem",opacity:0.65,textAlign:mio?"right":"left"}}>
                            {new Date(m.createdAt).toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"})}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={chatEndRef}/>
                </div>

                <div style={{padding:"0.75rem",borderTop:`1px solid ${THEME.border}`,display:"flex",gap:"0.5rem",flexShrink:0}}>
                  <input style={{...inp,margin:0,flex:1,borderRadius:"20px",paddingLeft:"1rem",fontSize:"0.88rem"}}
                    value={inputChat} onChange={e=>setInputChat(e.target.value)}
                    onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&enviarMensaje()}
                    placeholder={`Mensaje a ${chatConNombre}...`}
                    spellCheck lang="es"/>
                  <button onClick={enviarMensaje} disabled={!inputChat.trim()||enviandoChat} style={{
                    background:inputChat.trim()?`linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`:"#e2e8f0",
                    color:"white",border:"none",borderRadius:"50%",width:42,height:42,
                    cursor:inputChat.trim()?"pointer":"default",fontSize:"1rem",flexShrink:0,
                    boxShadow:inputChat.trim()?`0 3px 12px ${AZUL}44`:"none",
                    transition:"all 0.2s",display:"flex",alignItems:"center",justifyContent:"center",
                  }}>➤</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Overlay de seguimiento cuando regresa desde Wompi */}
      {trackingOrderId && (
        <TrackingOverlay
          orderId={trackingOrderId}
          productTitle={product?.title || "Tu compra en Colbisnes"}
          onClose={() => setTrackingOrderId(null)}
        />
      )}

      {/* Modal KYC requerido */}
      {mostrarKycModal && (
        <div
          onClick={() => setMostrarKycModal(false)}
          style={{
            position:"fixed",inset:0,background:"rgba(10,20,40,0.72)",
            backdropFilter:"blur(18px)",WebkitBackdropFilter:"blur(18px)",
            zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background:`linear-gradient(135deg,${THEME.primaryDark},${THEME.primary})`,borderRadius:24,padding:"36px 28px",maxWidth:380,width:"100%",
              textAlign:"center",boxShadow:"0 24px 80px rgba(0,0,0,0.5)",border:"1px solid rgba(255,205,0,0.6)",
            }}
          >
            <div style={{marginBottom:12}}></div>
            <h2 style={{fontSize:20,fontWeight:900,color:"#fff",margin:"0 0 10px"}}>
              Verifica tu identidad
            </h2>
            <p style={{fontSize:14,color:"rgba(255,255,255,0.8)",margin:"0 0 24px",lineHeight:1.6}}>
              Colbisnes es la plataforma más segura de Colombia. Para comprar, vender o hacer ofertas, necesitamos confirmar que eres una persona real.
            </p>
            <p style={{fontSize:12,color:"rgba(255,255,255,0.6)",margin:"0 0 20px",lineHeight:1.5}}>
              Solo toma 2 minutos — sube una foto de tu cédula y una selfie.
            </p>
            <button
              onClick={() => router.push("/kyc")}
              style={{
                width:"100%",padding:"14px",borderRadius:16,border:"none",
                background:`linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`,color:"#fff",
                fontSize:15,fontWeight:800,cursor:"pointer",
                boxShadow:"0 4px 14px rgba(31,107,255,0.4)",marginBottom:10,
              }}
            >
              🪪 Verificar mi identidad
            </button>
            <button
              onClick={() => setMostrarKycModal(false)}
              style={{
                width:"100%",padding:"11px",borderRadius:16,border:"1.5px solid rgba(255,205,0,0.4)",
                background:"transparent",color:"rgba(255,255,255,0.7)",fontSize:14,fontWeight:600,cursor:"pointer",
              }}
            >
              Ahora no
            </button>
          </div>
        </div>
      )}

      {mostrarPagarComision && ordenActiva && (
        <PagarComisionNequiModal
          orderId={ordenActiva.id}
          comisionCOP={ordenActiva.comisionReservaCOP || 0}
          nequiNumero={ordenActiva.nequiNumero || null}
          fechaLimiteEnvio={ordenActiva.fechaLimiteEnvio || null}
          onClose={() => setMostrarPagarComision(false)}
          onSuccess={() => { cargarOrden(); }}
        />
      )}
    </div>
  );
}

function MiniRow({icon,text,sub}:{icon:string;text:string;sub:string}) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:"0.6rem"}}>
      <span style={{fontSize:"1.1rem",width:22,textAlign:"center"}}>{icon}</span>
      <div>
        <p style={{margin:0,fontWeight:"700",fontSize:"0.83rem",color:THEME.text}}>{text}</p>
        <p style={{margin:0,fontSize:"0.73rem",color:THEME.muted}}>{sub}</p>
      </div>
    </div>
  );
}

function Acordeon({titulo,abierto,toggle,children}:{titulo:string;abierto:boolean;toggle:()=>void;children:React.ReactNode}) {
  return (
    <div style={{border:`1px solid ${THEME.border}`,borderRadius:"12px",overflow:"hidden",background:"#ffffff"}}>
      <button onClick={toggle} style={{width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",
        padding:"0.8rem 1rem",background:"none",border:"none",cursor:"pointer",fontWeight:"800",fontSize:"0.95rem",color:THEME.text}}>
        {titulo}
        <span style={{fontSize:"0.95rem",color:THEME.muted,transform:abierto?"rotate(0deg)":"rotate(-90deg)",transition:"transform 0.2s"}}>⌃</span>
      </button>
      {abierto && (
        <div style={{padding:"0 1rem 0.85rem",borderTop:`1px solid ${THEME.border}`,animation:"fadeIn 0.2s"}}>
          <div style={{paddingTop:"0.65rem"}}>{children}</div>
        </div>
      )}
    </div>
  );
}
