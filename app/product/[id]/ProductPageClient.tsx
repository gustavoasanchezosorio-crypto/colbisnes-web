"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useProductSocket } from "@/lib/useSocket";

interface Product {
  id: string; title: string; description: string; priceCOP: number;
  city: string; condition: string; status: string; sellerId: string;
  seller: { id: string; name: string; email: string };
  images: { url: string }[];
  acceptedOfferId?: string; paymentExpiresAt?: string;
}
interface Offer {
  id: string; amountCOP: number; message?: string; status: string;
  userId: string; user?: { name: string }; createdAt: string;
}

export default function ProductPageClient({ productId }: { productId: string }) {
  const { data: session } = useSession();
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [imagenActual, setImagenActual] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [mostrarOferta, setMostrarOferta] = useState(false);
  const [mostrarPago, setMostrarPago] = useState(false);
  const [mostrarWompi, setMostrarWompi] = useState(false);
  const [montoOferta, setMontoOferta] = useState("");
  const [mensajeOferta, setMensajeOferta] = useState("");
  const [enviandoOferta, setEnviandoOferta] = useState(false);
  const [errorOferta, setErrorOferta] = useState("");
  const [confirmandoPago, setConfirmandoPago] = useState(false);
  const [telefonoWompi, setTelefonoWompi] = useState("");
  const [procesandoWompi, setProcesandoWompi] = useState(false);
  const [mensajeWompi, setMensajeWompi] = useState("");
  const [pasoWompi, setPasoWompi] = useState<"form"|"esperando"|"exito"|"error">("form");

  const esVendedor = session?.user?.id === product?.sellerId;

  const [countdown, setCountdown] = useState(0);

  useProductSocket(productId, useCallback((data: any) => {
    if (data.productId === productId) {
      cargarProducto();
      cargarOfertas();
    }
  }, [productId]));

  useEffect(() => {
    if (!product?.paymentExpiresAt) return;
    const calcular = () => {
      const restante = Math.max(0, Math.floor((new Date(product.paymentExpiresAt!).getTime() - Date.now()) / 1000));
      setCountdown(restante);
    };
    calcular();
    const intervalo = setInterval(calcular, 1000);
    return () => clearInterval(intervalo);
  }, [product?.paymentExpiresAt]);
  const ofertaAceptada = offers.find(o => o.id === product?.acceptedOfferId);
  const miOferta = offers.find(o => o.userId === session?.user?.id);

  useEffect(() => { cargarProducto(); }, [productId]);
  useEffect(() => { if (product) cargarOfertas(); }, [product]);
  useEffect(() => {
    const intervalo = setInterval(() => {
      cargarProducto();
      cargarOfertas();
    }, 5000);
    return () => clearInterval(intervalo);
  }, [productId]);

  const cargarProducto = async () => {
    try {
      const res = await fetch(`/api/products/${productId}`);
      if (!res.ok) { router.push("/"); return; }
      setProduct(await res.json());
    } catch(e) { router.push("/"); }
    finally { setCargando(false); }
  };

  const cargarOfertas = async () => {
    try {
      const res = await fetch(`/api/offers?productId=${productId}`);
      const data = await res.json();
      setOffers(Array.isArray(data) ? data : []);
    } catch(e) {}
  };

  const enviarOferta = async () => {
    if (!montoOferta) { setErrorOferta("Ingresa un monto"); return; }
    if (product && Number(montoOferta) > product.priceCOP) { setErrorOferta("No puede superar el precio"); return; }
    setEnviandoOferta(true); setErrorOferta("");
    try {
      const res = await fetch("/api/offers", { method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ productId, amountCOP: Number(montoOferta), message: mensajeOferta }) });
      const data = await res.json();
      if (!res.ok) { setErrorOferta(data.error || "Error"); return; }
      setMostrarOferta(false); setMontoOferta(""); cargarOfertas();
    } catch(e) { setErrorOferta("Error de conexion"); }
    finally { setEnviandoOferta(false); }
  };

  const responderOferta = async (offerId: string, status: "ACCEPTED"|"REJECTED") => {
    try {
      const res = await fetch("/api/offers", { method: "PATCH", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ offerId, status }) });
      if (res.ok) { cargarProducto(); cargarOfertas(); }
    } catch(e) {}
  };

  const confirmarPago = async () => {
    setConfirmandoPago(true);
    try {
      const res = await fetch("/api/payments/confirm", { method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ productId }) });
      if (res.ok) { cargarProducto(); setMostrarPago(false); }
    } catch(e) {} finally { setConfirmandoPago(false); }
  };

  const iniciarPagoWompi = async () => {
    if (!telefonoWompi || telefonoWompi.length < 10) { setMensajeWompi("Numero invalido"); return; }
    setProcesandoWompi(true);
    try {
      const res = await fetch("/api/pagos/wompi", { method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ productId, offerId: product?.acceptedOfferId, phoneNumber: telefonoWompi, metodoPago: "NEQUI" }) });
      const data = await res.json();
      if (!res.ok) { setMensajeWompi(data.error || "Error"); return; }
      setPasoWompi("esperando");
      const intervalo = setInterval(async () => {
        const r = await fetch(`/api/pagos/estado?transactionId=${data.transactionId}&productId=${productId}`);
        const d = await r.json();
        if (d.aprobado) { clearInterval(intervalo); setPasoWompi("exito"); cargarProducto(); }
        if (d.rechazado) { clearInterval(intervalo); setPasoWompi("error"); setMensajeWompi("Pago rechazado"); }
      }, 3000);
      setTimeout(() => clearInterval(intervalo), 300000);
    } catch(e) { setMensajeWompi("Error de conexion"); }
    finally { setProcesandoWompi(false); }
  };

  const btn = (color: string, dis?: boolean) => ({ backgroundColor: dis?"#ccc":color, color:"white", border:"none",
    padding:"0.8rem 1.5rem", borderRadius:"8px", cursor:dis?"not-allowed":"pointer", fontSize:"1rem",
    fontWeight:"bold" as const, width:"100%", marginTop:"0.5rem" });
  const overlay = { position:"fixed" as const, inset:0, backgroundColor:"rgba(0,0,0,0.6)", zIndex:1000,
    display:"flex", alignItems:"center", justifyContent:"center", padding:"1rem" };
  const modal = { backgroundColor:"white", borderRadius:"12px", padding:"2rem", maxWidth:"450px", width:"100%" };
  const inp = { width:"100%", padding:"0.7rem", borderRadius:"8px", border:"1px solid #ddd",
    fontSize:"1rem", boxSizing:"border-box" as const, marginTop:"0.3rem" };
  const colorEstado: any = { AVAILABLE:"#00aa44", PAYMENT_PENDING:"#ff9900", IN_ESCROW:"#8B4FDB", SOLD:"#666" };
  const labelEstado: any = { AVAILABLE:"Disponible", PAYMENT_PENDING:"Pago pendiente", IN_ESCROW:"En custodia", SOLD:"Vendido" };

  if (cargando) return <div style={{textAlign:"center",padding:"4rem",color:"#aaa"}}>Cargando...</div>;
  if (!product) return <div style={{textAlign:"center",padding:"4rem"}}>Producto no encontrado</div>;


  return (
    <div style={{maxWidth:"900px",margin:"0 auto",padding:"1.5rem 1rem",fontFamily:"sans-serif",color:"#333"}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"2rem"}}>
        <div>
          {product.images?.length > 0 ? (
            <>
              <img src={product.images[imagenActual]?.url} alt={product.title}
                style={{width:"100%",height:"400px",objectFit:"cover",borderRadius:"12px"}} />
              {product.images.length > 1 && (
                <div style={{display:"flex",gap:"0.5rem",marginTop:"0.5rem",flexWrap:"wrap"}}>
                  {product.images.map((img,i) => (
                    <img key={i} src={img.url} alt="" onClick={() => setImagenActual(i)}
                      style={{width:"70px",height:"70px",objectFit:"cover",borderRadius:"8px",cursor:"pointer",
                        border:i===imagenActual?"3px solid #00589F":"3px solid transparent"}} />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div style={{width:"100%",height:"400px",backgroundColor:"#f0f0f0",borderRadius:"12px",
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:"4rem"}}>
              Sin imagen
            </div>
          )}
        </div>
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"0.5rem"}}>
            <h1 style={{fontSize:"1.5rem",fontWeight:"bold",margin:0}}>{product.title}</h1>
            <span style={{backgroundColor:colorEstado[product.status],color:"white",padding:"0.3rem 0.8rem",
              borderRadius:"20px",fontSize:"0.8rem",fontWeight:"bold"}}>{labelEstado[product.status]}</span>
          </div>
          <p style={{fontSize:"2rem",fontWeight:"bold",color:"#00589F",margin:"0.5rem 0"}}>
            ${product.priceCOP.toLocaleString("es-CO")} COP
          </p>
          <p style={{color:"#666",marginBottom:"0.3rem"}}>Ciudad: {product.city}</p>
          <p style={{color:"#666",marginBottom:"1rem"}}>Condicion: {product.condition}</p>
          <p style={{lineHeight:"1.6",color:"#444",marginBottom:"1.5rem"}}>{product.description}</p>
          <div style={{backgroundColor:"#f8f9fa",borderRadius:"8px",padding:"1rem",marginBottom:"1rem"}}>
            <p style={{margin:0,fontWeight:"bold"}}>Vendedor</p>
            <p style={{margin:"0.3rem 0 0",color:"#666"}}>{product.seller.name || "Anonimo"}</p>
            <a href={`/user/${product.sellerId}`} style={{color:"#00589F",fontSize:"0.85rem"}}>Ver perfil</a>
          </div>
          {product.status==="AVAILABLE" && !esVendedor && session?.user && !miOferta && (
            <button style={btn("#D4AF37")} onClick={() => setMostrarOferta(true)}>Hacer oferta</button>
          )}
          {miOferta && product.status==="AVAILABLE" && (
            <div style={{backgroundColor:"#fffbf0",border:"1px solid #D4AF37",borderRadius:"8px",padding:"1rem"}}>
              <p style={{margin:0,fontWeight:"bold",color:"#D4AF37"}}>Tu oferta enviada</p>
              <p style={{margin:"0.3rem 0 0"}}>${miOferta.amountCOP.toLocaleString("es-CO")} - {miOferta.status}</p>
            </div>
          )}
          {product.status==="PAYMENT_PENDING" && !esVendedor && session?.user && (
            <div style={{backgroundColor:"#fff9f0",border:"1px solid #ff9900",borderRadius:"8px",padding:"1rem"}}>
              <p style={{fontWeight:"bold",color:"#ff9900",margin:"0 0 0.5rem"}}>Tu oferta fue aceptada</p>
              {countdown > 0 && product?.status === "PAYMENT_PENDING" && (
                <p style={{margin:"0 0 0.5rem",fontSize:"0.9rem"}}>
                  Tiempo: {Math.floor(countdown/60)}:{String(countdown%60).padStart(2,"0")} min
                </p>
              )}
              <button style={btn("#8B4FDB")} onClick={() => setMostrarWompi(true)}>Pagar con Nequi (Wompi)</button>
              <button style={btn("#666")} onClick={() => setMostrarPago(true)}>Pago manual</button>
            </div>
          )}
          {product.status==="IN_ESCROW" && esVendedor && (
            <div style={{backgroundColor:"#f0fff4",border:"1px solid #68d391",borderRadius:"8px",padding:"1rem"}}>
              <p style={{fontWeight:"bold",color:"#00aa44",margin:"0 0 0.5rem"}}>Pago recibido</p>
              <button style={btn("#00aa44")} onClick={async () => {
                const res = await fetch("/api/payments/confirm-delivery", { method:"POST",
                  headers:{"Content-Type":"application/json"}, body:JSON.stringify({ productId }) });
                if (res.ok) cargarProducto();
              }}>Confirmar entrega</button>
            </div>
          )}
          {product.status==="SOLD" && <span style={{backgroundColor:"#666",color:"white",padding:"0.3rem 0.8rem",borderRadius:"20px"}}>Vendido</span>}
          {!session?.user && product.status==="AVAILABLE" && (
            <a href="/auth/login" style={{...btn("#00589F"),textDecoration:"none",textAlign:"center",display:"block"}}>
              Inicia sesion para ofertar
            </a>
          )}
        </div>
      </div>

      {esVendedor && offers.length > 0 && (
        <div style={{marginTop:"2rem"}}>
          <h2 style={{fontSize:"1.2rem",fontWeight:"bold",marginBottom:"1rem"}}>Ofertas recibidas</h2>
          {offers.map(oferta => (
            <div key={oferta.id} style={{backgroundColor:oferta.status==="ACCEPTED"?"#f0fff4":oferta.status==="REJECTED"?"#fff5f5":"#f8f9fa",
              border:`1px solid ${oferta.status==="ACCEPTED"?"#68d391":oferta.status==="REJECTED"?"#fc8181":"#e2e8f0"}`,
              borderRadius:"8px",padding:"1rem",marginBottom:"0.5rem"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <p style={{margin:0,fontWeight:"bold"}}>${oferta.amountCOP.toLocaleString("es-CO")} COP</p>
                  <p style={{margin:"0.2rem 0 0",fontSize:"0.85rem",color:"#666"}}>
                    {oferta.user?.name||"Comprador"} - {new Date(oferta.createdAt).toLocaleDateString("es-CO")}
                  </p>
                  {oferta.message && <p style={{margin:"0.3rem 0 0",fontStyle:"italic",fontSize:"0.9rem"}}>"{oferta.message}"</p>}
                </div>
                <div style={{display:"flex",gap:"0.5rem"}}>
                  {oferta.status==="PENDING" && product.status==="AVAILABLE" && (
                    <>
                      <button onClick={() => responderOferta(oferta.id,"ACCEPTED")}
                        style={{backgroundColor:"#00aa44",color:"white",border:"none",padding:"0.4rem 0.8rem",borderRadius:"6px",cursor:"pointer"}}>
                        Aceptar
                      </button>
                      <button onClick={() => responderOferta(oferta.id,"REJECTED")}
                        style={{backgroundColor:"#ff4444",color:"white",border:"none",padding:"0.4rem 0.8rem",borderRadius:"6px",cursor:"pointer"}}>
                        Rechazar
                      </button>
                    </>
                  )}
                  {oferta.status!=="PENDING" && (
                    <span style={{backgroundColor:oferta.status==="ACCEPTED"?"#00aa44":"#ff4444",color:"white",
                      padding:"0.2rem 0.6rem",borderRadius:"4px",fontSize:"0.8rem"}}>
                      {oferta.status==="ACCEPTED"?"Aceptada":"Rechazada"}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {mostrarOferta && (
        <div style={overlay}>
          <div style={modal}>
            <h2 style={{marginTop:0}}>Hacer oferta</h2>
            <p style={{color:"#666"}}>{product.title} - ${product.priceCOP.toLocaleString("es-CO")}</p>
            <label style={{fontWeight:"bold",fontSize:"0.9rem"}}>Monto (COP)</label>
            <input style={inp} type="number" value={montoOferta} onChange={e => setMontoOferta(e.target.value)}
              placeholder={`Maximo $${product.priceCOP.toLocaleString("es-CO")}`} />
            <label style={{fontWeight:"bold",fontSize:"0.9rem",marginTop:"0.8rem",display:"block"}}>Mensaje (opcional)</label>
            <textarea style={{...inp,height:"80px",resize:"none"}} value={mensajeOferta}
              onChange={e => setMensajeOferta(e.target.value)} placeholder="Cuentale algo al vendedor..." />
            {errorOferta && <p style={{color:"#ff4444",fontSize:"0.9rem",margin:"0.5rem 0"}}>{errorOferta}</p>}
            <button style={btn("#D4AF37",enviandoOferta)} onClick={enviarOferta} disabled={enviandoOferta}>
              {enviandoOferta?"Enviando...":"Enviar oferta"}
            </button>
            <button style={{...btn("#ccc"),color:"#333"}} onClick={() => setMostrarOferta(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {mostrarPago && (
        <div style={overlay}>
          <div style={modal}>
            <h2 style={{marginTop:0}}>Instrucciones de pago</h2>
            <div style={{backgroundColor:"#f8f9fa",borderRadius:"8px",padding:"1rem",margin:"1rem 0"}}>
              <p style={{margin:0}}><strong>Vendedor:</strong> {product.seller.name}</p>
              <p style={{margin:"0.5rem 0 0"}}><strong>Monto:</strong> ${(ofertaAceptada?.amountCOP||product.priceCOP).toLocaleString("es-CO")} COP</p>
            </div>
            <button style={btn("#00589F",confirmandoPago)} onClick={confirmarPago} disabled={confirmandoPago}>
              {confirmandoPago?"Confirmando...":"Ya pague"}
            </button>
            <button style={{...btn("#ccc"),color:"#333"}} onClick={() => setMostrarPago(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {mostrarWompi && (
        <div style={overlay}>
          <div style={modal}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1rem"}}>
              <h2 style={{margin:0,color:"#8B4FDB"}}>Pagar con Nequi</h2>
              <button onClick={() => {setMostrarWompi(false);setPasoWompi("form");}}
                style={{background:"none",border:"none",fontSize:"1.5rem",cursor:"pointer"}}>X</button>
            </div>
            <p style={{color:"#666",fontSize:"1.3rem",fontWeight:"bold",textAlign:"center"}}>
              ${(ofertaAceptada?.amountCOP||product.priceCOP).toLocaleString("es-CO")} COP
            </p>
            {pasoWompi==="form" && (
              <>
                <label style={{fontWeight:"bold",fontSize:"0.9rem"}}>Numero de celular Nequi</label>
                <input style={inp} type="tel" maxLength={10} value={telefonoWompi} placeholder="3001234567"
                  onChange={e => setTelefonoWompi(e.target.value.replace(/\D/g,""))} />
                {mensajeWompi && <p style={{color:"#ff4444",fontSize:"0.9rem",margin:"0.5rem 0"}}>{mensajeWompi}</p>}
                <button style={btn("#8B4FDB",procesandoWompi)} onClick={iniciarPagoWompi} disabled={procesandoWompi}>
                  {procesandoWompi?"Procesando...":"Enviar solicitud de pago"}
                </button>
              </>
            )}
            {pasoWompi==="esperando" && (
              <div style={{textAlign:"center",padding:"1rem"}}>
                <p style={{fontWeight:"bold",color:"#8B4FDB"}}>Revisa tu app de Nequi</p>
                <p style={{color:"#888",fontSize:"0.9rem"}}>Verificando automaticamente...</p>
              </div>
            )}
            {pasoWompi==="exito" && (
              <div style={{textAlign:"center",padding:"1rem"}}>
                <p style={{fontWeight:"bold",color:"#00aa44",fontSize:"1.1rem"}}>Pago exitoso</p>
                <p style={{color:"#666",fontSize:"0.9rem"}}>El vendedor recibira el dinero al confirmar entrega.</p>
              </div>
            )}
            {pasoWompi==="error" && (
              <div style={{textAlign:"center",padding:"1rem"}}>
                <p style={{fontWeight:"bold",color:"#ff4444"}}>Pago no completado</p>
                <p style={{color:"#888",fontSize:"0.9rem"}}>{mensajeWompi}</p>
                <button style={btn("#8B4FDB")} onClick={() => setPasoWompi("form")}>Intentar de nuevo</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
// Este comentario no afecta el codigo
