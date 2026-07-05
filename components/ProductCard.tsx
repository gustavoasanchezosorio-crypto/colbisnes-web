'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, OutlineButton } from './FormComponents';
import { THEME } from '@/lib/theme';
import { formatMoney, getTimeLeft, getStatusLabel } from '@/lib/utils';
import MarcarEnviadoModal from './MarcarEnviadoModal';

interface ProductCardProps {
  product: any;
  onSelect: (id: string) => void;
  onPaymentRequest: (productId: string) => void;
  onConfirmDelivery: (id: string) => Promise<void>;
  onReviewClick: (product: any) => void;
  isSelected: boolean;
  isOwner: boolean;
  currentUserId?: string | null;
  pendingOffersCount: number;
  mensajesNoLeidos?: number;
}

export const ProductCard = React.memo(function ProductCard({
  product,
  onSelect,
  onPaymentRequest,
  onConfirmDelivery,
  onReviewClick,
  isSelected,
  isOwner,
  currentUserId,
  pendingOffersCount,
  mensajesNoLeidos: mensajesNoLeidosProp = 0,
}: ProductCardProps) {
  const timer = getTimeLeft(product.paymentExpiresAt);
  const isSold = product.status === 'SOLD';
  const status = getStatusLabel(product.status);
  const firstImage = product.firstImage;

  const isFeatured = !!product.featuredUntil && new Date(product.featuredUntil) > new Date();

  const ofertaAceptadaUserId = product.offers && product.offers.length > 0 ? product.offers[0].userId : null;
  const esCompradorAutorizado = !!currentUserId && currentUserId === ofertaAceptadaUserId;

  const handleSelect = useCallback(() => onSelect(product.id), [product.id, onSelect]);
  const handlePaymentRequest = useCallback(() => { window.location.href = "/checkout/" + product.id; }, [product.id]);
  const handleConfirmDelivery = useCallback(() => onConfirmDelivery(product.id), [product.id, onConfirmDelivery]);
  const handleReviewClick = useCallback(() => onReviewClick(product), [product.id, onReviewClick]);

  const [ordenActiva, setOrdenActiva] = useState<any>(null);
  const [showEnviarModal, setShowEnviarModal] = useState(false);
  const [showGaleria, setShowGaleria] = useState(false);
  const [fotoActual, setFotoActual] = useState(0);
  const [esFavorito, setEsFavorito] = useState(false);
  const [favCount, setFavCount] = useState<number>(product.favoritosCount || 0);
  const mensajesNoLeidos = mensajesNoLeidosProp;
  const todasLasFotos: string[] = (product.images && product.images.length > 0)
    ? product.images.map((img: any) => img.url)
    : (firstImage ? [firstImage] : []);

  useEffect(() => {
    fetch(`/api/favorites?productId=${product.id}`)
      .then(r => r.json())
      .then(d => { setEsFavorito(d.esFavorito); setFavCount(d.count); })
      .catch(() => {});
  }, [product.id]);

  const toggleFav = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const res = await fetch("/api/favorites", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ productId: product.id }) });
    if (res.ok) { const d = await res.json(); setEsFavorito(d.esFavorito); setFavCount(d.count); }
  }, [product.id]);

  const prevFoto = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setFotoActual(p => (p - 1 + todasLasFotos.length) % todasLasFotos.length);
  }, [todasLasFotos.length]);

  const nextFoto = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setFotoActual(p => (p + 1) % todasLasFotos.length);
  }, [todasLasFotos.length]);

  useEffect(() => {
    if (product.status === 'IN_ESCROW' || product.status === 'SOLD') {
      fetch("/api/orders/por-producto?productId=" + product.id)
        .then(r => r.json())
        .then(d => { if (d.orden) setOrdenActiva(d.orden); })
        .catch(() => {});
    }
  }, [product.id, product.status]);

  const refrescarOrden = useCallback(() => {
    fetch("/api/orders/por-producto?productId=" + product.id)
      .then(r => r.json())
      .then(d => { if (d.orden) setOrdenActiva(d.orden); })
      .catch(() => {});
  }, [product.id]);

  const enTramiteParaOtros = product.status === 'PAYMENT_PENDING' && timer && timer !== "00:00" && !isOwner && !esCompradorAutorizado;
  const enCustodiaParaOtros = product.status === 'IN_ESCROW' && !isOwner && !esCompradorAutorizado;

  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (!enCustodiaParaOtros || !ordenActiva?.fechaLimiteEnvio) return;
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [enCustodiaParaOtros, ordenActiva?.fechaLimiteEnvio]);

  const custodiaTimer = (() => {
    if (!ordenActiva?.fechaLimiteEnvio) return null;
    const diff = new Date(ordenActiva.fechaLimiteEnvio).getTime() - ahora;
    if (diff <= 0) return "00:00:00";
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  })();

  return (
    <div
      style={{
        position: "relative",
        background: THEME.surfaceGradient,
        borderRadius: 20,
        padding: "20px",
        border: "1.5px solid transparent",
        boxShadow: THEME.cardShadow,
        transition: "all 0.25s",
        overflow: "hidden",
      }}
    >
      {enTramiteParaOtros && (
        <div style={{
          position: "absolute",
          inset: 0,
          zIndex: 50,
          borderRadius: 20,
          background: "rgba(240,246,255,0.88)",
          backdropFilter: "blur(14px) saturate(1.4)",
          WebkitBackdropFilter: "blur(14px) saturate(1.4)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "28px 24px",
          gap: 10,
          border: "1px solid rgba(31,107,255,0.35)",
          animation: "liquidFadeIn 0.4s ease",
        }}>
          <div style={{
            width: 68, height: 68,
            borderRadius: "50%",
            background: "linear-gradient(135deg, rgba(31,107,255,0.18), rgba(31,107,255,0.06))",
            border: "1px solid rgba(31,107,255,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 34,
            boxShadow: "0 8px 24px rgba(0,63,122,0.18)",
          }}>☕</div>
          <p style={{ margin: 0, lineHeight: 1.15 }}>
            <span style={{ display: "block", fontWeight: 800, fontSize: "1.2rem", color: THEME.text }}>Aqui se esta cerrando un</span>
            <span style={{ display: "block", fontWeight: 800, fontSize: "1.65rem", letterSpacing: "-1.2px", color: "#1F6BFF", marginTop: 2 }}>bisnes</span>
          </p>
          <p style={{ fontSize: "1.05rem", color: THEME.textSoft, margin: 0, lineHeight: 1.5, maxWidth: 280, fontWeight: 600 }}>
            Tomate un tintico en{" "}
            <span style={{ fontWeight: 900, color: THEME.gold, fontSize: "1.15rem" }}>{timer}</span>
            {" "}si no se realiza el pago el producto estara disponible de nuevo
          </p>
        </div>
      )}
      {enCustodiaParaOtros && (
        <div style={{
          position: "absolute",
          inset: 0,
          zIndex: 50,
          borderRadius: 20,
          background: "rgba(240,246,255,0.88)",
          backdropFilter: "blur(14px) saturate(1.4)",
          WebkitBackdropFilter: "blur(14px) saturate(1.4)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "28px 24px",
          gap: 10,
          border: "1px solid rgba(31,107,255,0.35)",
          animation: "liquidFadeIn 0.4s ease",
        }}>
          <div style={{
            width: 68, height: 68,
            borderRadius: "50%",
            background: "linear-gradient(135deg, rgba(31,107,255,0.18), rgba(31,107,255,0.06))",
            border: "1px solid rgba(31,107,255,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 34,
            boxShadow: "0 8px 24px rgba(0,63,122,0.18)",
          }}>☕</div>
          <p style={{ margin: 0, lineHeight: 1.15 }}>
            <span style={{ display: "block", fontWeight: 800, fontSize: "1.2rem", color: THEME.text }}>Aqui se esta cerrando un</span>
            <span style={{ display: "block", fontWeight: 800, fontSize: "1.65rem", letterSpacing: "-1.2px", color: "#1F6BFF", marginTop: 2 }}>bisnes</span>
          </p>
          <p style={{ fontSize: "1.05rem", color: THEME.textSoft, margin: 0, lineHeight: 1.5, maxWidth: 280, fontWeight: 600 }}>
            Tomate un tintico, el pago esta protegido por Colbisnes mientras se confirma la entrega.
          </p>
          {custodiaTimer && (
            <p style={{ fontSize: "0.85rem", color: THEME.muted, margin: 0, lineHeight: 1.4, maxWidth: 280 }}>
              Tiempo estimado de espera:{" "}
              <span style={{ fontWeight: 900, color: THEME.gold, fontSize: "0.95rem", fontVariantNumeric: "tabular-nums" }}>{custodiaTimer}</span>
            </p>
          )}
        </div>
      )}
      <style>{`@keyframes liquidFadeIn { from { opacity: 0; backdrop-filter: blur(0px); } to { opacity: 1; backdrop-filter: blur(14px); } }`}</style>
      {isSold && (
        <div style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          zIndex: 10,
          background: "linear-gradient(180deg, rgba(10,16,28,0.55), rgba(10,16,28,0.70))",
          backdropFilter: "blur(1.5px)",
          WebkitBackdropFilter: "blur(1.5px)",
        }}>
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
            padding: "16px 24px",
            textAlign: "center",
          }}>
            <div style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              overflow: "hidden",
              position: "relative",
              boxShadow: "0 8px 22px rgba(0,0,0,0.45)",
              border: "2.5px solid rgba(255,255,255,0.9)",
            }}>
              {/* Bandera de Colombia: amarillo 50%, azul 25%, rojo 25% */}
              <div style={{ position: "absolute", inset: 0, background: "#FCD116" }} />
              <div style={{ position: "absolute", left: 0, right: 0, top: "50%", height: "25%", background: "#003893" }} />
              <div style={{ position: "absolute", left: 0, right: 0, top: "75%", height: "25%", background: "#CE1126" }} />
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.25)" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M5 12.5l4.3 4.3L19 7" stroke="#0e56c0" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>
            </div>
            <div style={{ lineHeight: 1.15 }}>
              <div style={{
                color: "#5FA8FF",
                fontWeight: 900,
                fontSize: "1.35rem",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                textShadow: "0 2px 10px rgba(0,0,0,0.45)",
              }}>
                Vendido
              </div>
              <div style={{
                color: "#cfe0fb",
                fontWeight: 700,
                fontSize: "0.72rem",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                marginTop: 4,
              }}>
                por Colbisnes
              </div>
            </div>
            {(isOwner || esCompradorAutorizado) && (
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleReviewClick(); }}
                style={{
                  pointerEvents: "auto",
                  marginTop: 4,
                  background: "rgba(255,255,255,0.95)",
                  color: "#0a2e6b",
                  border: "none",
                  borderRadius: 20,
                  padding: "8px 18px",
                  fontWeight: 800,
                  fontSize: "0.82rem",
                  cursor: "pointer",
                  boxShadow: "0 4px 14px rgba(0,0,0,0.28)",
                }}
              >
                ⭐ Calificar transacción
              </button>
            )}
          </div>
        </div>
      )}

      <div style={{ position: "relative", zIndex: isSold ? 5 : 2 }}>
        {todasLasFotos.length > 0 && (
          <div style={{ position: "relative", marginBottom: "12px", borderRadius: "12px", overflow: "hidden", aspectRatio: "4/3", background: "#eef2f7" }}>
            <img
              src={todasLasFotos[fotoActual]}
              alt={product.title}
              onClick={() => setShowGaleria(true)}
              style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", cursor: "pointer" }}
            />

            {/* Flechas navegación */}
            {todasLasFotos.length > 1 && (
              <>
                <button onClick={prevFoto} style={{
                  position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",
                  width:32,height:32,borderRadius:"50%",border:"none",cursor:"pointer",
                  background:"rgba(0,0,0,0.45)",backdropFilter:"blur(4px)",
                  color:"white",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",zIndex:5,
                }}>‹</button>
                <button onClick={nextFoto} style={{
                  position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",
                  width:32,height:32,borderRadius:"50%",border:"none",cursor:"pointer",
                  background:"rgba(0,0,0,0.45)",backdropFilter:"blur(4px)",
                  color:"white",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",zIndex:5,
                }}>›</button>
                {/* Puntos */}
                <div style={{position:"absolute",bottom:8,left:"50%",transform:"translateX(-50%)",display:"flex",gap:5,zIndex:5}}>
                  {todasLasFotos.map((_:string,i:number) => (
                    <div key={i} onClick={(e)=>{e.stopPropagation();setFotoActual(i);}}
                      style={{width:i===fotoActual?18:6,height:6,borderRadius:3,cursor:"pointer",
                        background:i===fotoActual?"#00589F":"rgba(255,255,255,0.6)",transition:"all 0.2s"}}/>
                  ))}
                </div>
              </>
            )}

            {/* Badge de producto destacado */}
            {isFeatured && (
              <span style={{
                position: "absolute", top: 10, left: 10, zIndex: 5,
                background: "linear-gradient(135deg,#F59E0B,#D97706)",
                color: "#fff", padding: "4px 10px", borderRadius: 20,
                fontSize: 11.5, fontWeight: 800, boxShadow: "0 3px 12px rgba(217,119,6,0.45)",
                display: "flex", alignItems: "center", gap: 4,
              }}>
                🚀 Destacado
              </span>
            )}

            {/* Corazón favoritos — solo para compradores */}
            {!isOwner && <button onClick={toggleFav} style={{
              position:"absolute",top:10,right:10,
              background:"#ffffff",
              border: esFavorito ? "1.5px solid #ef4444" : "1.5px solid rgba(0,0,0,0.08)",
              borderRadius:"20px",padding:"4px 10px",
              cursor:"pointer",display:"flex",alignItems:"center",gap:5,
              fontSize:13,fontWeight:700,color:"#333",zIndex:5,
              boxShadow: esFavorito ? "0 2px 10px rgba(0,0,0,0.18), 0 0 0 3px rgba(239,68,68,0.15)" : "0 2px 10px rgba(0,0,0,0.18)",
            }}>
              <span style={{fontSize:16, filter:"drop-shadow(0 1px 1px rgba(0,0,0,0.25))"}}>{esFavorito ? "❤️" : "🤍"}</span>
              {favCount > 0 && <span>{favCount}</span>}
            </button>}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <Link href={`/product/${product.id}`} style={{ textDecoration: "none" }}>
              <h3 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: 6, color: THEME.text, cursor: "pointer" }}>
                {product.title}
              </h3>
            </Link>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
              <span style={{ fontSize: "0.9rem", color: THEME.muted }}>📍 {product.city}</span>
              <span style={{ fontSize: "0.9rem", color: THEME.muted }}>📦 {status}</span>
              {!isSold && isOwner && pendingOffersCount > 0 && (
                <span style={{
                  background: "linear-gradient(135deg,#1448A3,#1F6BFF)",
                  color: "#fff",
                  padding: "5px 12px",
                  borderRadius: 20,
                  fontSize: "0.8rem",
                  fontWeight: 800,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  boxShadow: "0 3px 12px rgba(31,107,255,0.4)",
                  animation: "ofertaPulse 1.6s ease-in-out infinite",
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff", animation: "ofertaBlink 1.6s ease-in-out infinite" }} />
                  {pendingOffersCount} oferta{pendingOffersCount !== 1 ? "s" : ""} nueva{pendingOffersCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <p style={{ fontSize: "0.9rem", marginTop: 8, color: THEME.muted, lineHeight: 1.5 }}>
              {product.description}
            </p>

            {product.seller && (
              <Link
                href={`/user/${product.seller.id}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 12,
                  color: THEME.primary,
                  textDecoration: "none",
                  fontSize: "0.9rem",
                }}
              >
                <span>Vendedor: {product.seller.name || "Anónimo"}</span>
                {product.seller.avgRating ? (
                  <span style={{
                    background: THEME.secondary,
                    color: "#1a1200",
                    padding: "4px 8px",
                    borderRadius: 20,
                    fontSize: "0.7rem",
                    fontWeight: 600,
                  }}>
                    {product.seller.avgRating} ⭐ ({product.seller.totalReviews})
                  </span>
                ) : (
                  <span style={{
                    background: THEME.surfaceAlt,
                    color: THEME.muted,
                    padding: "4px 8px",
                    borderRadius: 20,
                    fontSize: "0.7rem",
                  }}>
                    Nuevo vendedor
                  </span>
                )}
                {product.seller.kycStatus === "approved" && (
                  <span style={{ color: THEME.secondary, cursor: "help" }} title="Usuario verificado">✓</span>
                )}
              </Link>
            )}
          </div>
          <div style={{ fontSize: "1.8rem", fontWeight: 900, color: THEME.primary, marginLeft: 16 }}>
            {formatMoney(product.priceCOP)}
          </div>
        </div>

        {product.status === 'PAYMENT_PENDING' && timer && timer !== "00:00" && isOwner && (
          <div style={{
            marginTop: 16,
            padding: 14,
            background: "#f0f6ff",
            border: "1px solid rgba(31,107,255,0.25)",
            borderRadius: 14,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}>
            <span style={{ fontSize: "1.3rem" }}>⏳</span>
            <span style={{ fontSize: "0.85rem", color: THEME.textSoft, lineHeight: 1.5 }}>
              <strong style={{ color: THEME.primary }}>Esperando el pago del comprador</strong> — vence en{" "}
              <span style={{ fontWeight: 800, color: THEME.gold }}>{timer}</span>
            </span>
          </div>
        )}

        <div style={{ display: "flex", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
          {!isSold && (
            <>
              {product.status === 'PAYMENT_PENDING' && !isOwner && esCompradorAutorizado && (
                <Button onClick={handlePaymentRequest}>Realizar pago</Button>
              )}
              {product.status === 'IN_ESCROW' && isOwner && (!ordenActiva || ordenActiva.estado === 'PAGADO' || ordenActiva.estado === 'ESPERANDO_ENVIO') && (
                <div style={{ width: "100%", background: "rgba(31,107,255,0.10)", border: "1px solid rgba(31,107,255,0.35)", borderRadius: 14, padding: "12px 14px", marginBottom: 4 }}>
                  <p style={{ color: "#0a4fa0", fontWeight: 800, fontSize: 12, margin: "0 0 4px" }}>🔒 Dinero retenido por Colbisnes</p>
                  <p style={{ color: THEME.textSoft, fontSize: 11.5, margin: 0, lineHeight: 1.5 }}>Vendedor → <strong style={{ color: THEME.gold }}>Colbisnes</strong> → Comprador. El pago está en custodia y se libera a tu cuenta solo cuando el comprador confirme que recibió el producto.</p>
                </div>
              )}
              {product.status === 'IN_ESCROW' && isOwner && ordenActiva && (ordenActiva.estado === 'EN_CAMINO' || ordenActiva.estado === 'ENTREGADO') && (
                <div style={{ width: "100%", background: "rgba(234,179,8,0.14)", border: "1px solid rgba(234,179,8,0.45)", borderRadius: 14, padding: "12px 14px", marginBottom: 4 }}>
                  <p style={{ color: "#b45309", fontWeight: 800, fontSize: 12, margin: "0 0 4px" }}>⏳ Esperando confirmación del comprador</p>
                  <p style={{ color: THEME.textSoft, fontSize: 11.5, margin: 0, lineHeight: 1.5 }}>Tu pago sigue en custodia. Se libera automáticamente cuando el comprador confirme la entrega.</p>
                </div>
              )}
              {product.status === 'IN_ESCROW' && esCompradorAutorizado && (
                <div style={{ width: "100%", background: "rgba(34,197,94,0.13)", border: "1px solid rgba(34,197,94,0.42)", borderRadius: 14, padding: "12px 14px", marginBottom: 4 }}>
                  <p style={{ color: "#15803d", fontWeight: 800, fontSize: 12, margin: "0 0 4px" }}>🔒 Tu dinero está protegido</p>
                  <p style={{ color: THEME.textSoft, fontSize: 11.5, margin: 0, lineHeight: 1.5 }}>Colbisnes retiene el pago hasta que confirmes que recibiste tu producto en buen estado. Solo entonces se libera al vendedor.</p>
                </div>
              )}
              {product.status === 'IN_ESCROW' && isOwner && (!ordenActiva || ordenActiva.estado === 'PAGADO' || ordenActiva.estado === 'ESPERANDO_ENVIO') && (
                <Button onClick={() => setShowEnviarModal(true)}>📦 Registrar envio</Button>
              )}
              {product.status === 'IN_ESCROW' && isOwner && ordenActiva && (ordenActiva.estado === 'EN_CAMINO' || ordenActiva.estado === 'ENTREGADO') && (
                <OutlineButton onClick={() => setShowEnviarModal(true)}>
                  🚚 Guia: {ordenActiva.numeroGuia}
                </OutlineButton>
              )}
              {product.status === 'IN_ESCROW' && esCompradorAutorizado && ordenActiva && ordenActiva.estado === 'EN_CAMINO' && (
                <Button onClick={handleConfirmDelivery}>✅ Confirmar entrega</Button>
              )}
              {product.status === 'IN_ESCROW' && esCompradorAutorizado && (!ordenActiva || (ordenActiva.estado !== 'EN_CAMINO' && ordenActiva.estado !== 'ENTREGADO')) && (
                <OutlineButton onClick={() => {}} style={{ opacity: 0.6, cursor: "default" }}>⏳ Esperando envio del vendedor</OutlineButton>
              )}
              {!isOwner && product.status === 'AVAILABLE' && (
                <Button onClick={() => { window.location.href = `/product/${product.id}`; }}>
                  💬 Ver detalle y chatear
                </Button>
              )}
              {!isOwner && product.status === 'AVAILABLE' ? (
                <OutlineButton onClick={handleSelect}>
                  {isSelected ? "Ofertas abiertas" : "Hacer oferta"}
                </OutlineButton>
              ) : (
                pendingOffersCount > 0 && (
                  <OutlineButton onClick={handleSelect}>
                    {isSelected ? "Ocultar ofertas" : `Ver ofertas (${pendingOffersCount})`}
                  </OutlineButton>
                )
              )}
            </>
          )}
          {isSold && (isOwner || esCompradorAutorizado) && (
            <OutlineButton onClick={handleReviewClick}>
              Calificar transacción
            </OutlineButton>
          )}
        </div>

        {/* ── Widget mensajes no leídos (solo vendedor) ── */}
        {isOwner && mensajesNoLeidos > 0 && (
          <a href={`/product/${product.id}`} style={{ textDecoration:"none", display:"block", marginTop:12 }}>
            <div style={{
              display:"flex", alignItems:"center", gap:10,
              background:"#f0f6ff",
              border:"1.5px solid rgba(31,107,255,0.3)",
              borderRadius:12, padding:"10px 14px",
              cursor:"pointer",
            }}>
              <div style={{position:"relative",flexShrink:0}}>
                <span style={{fontSize:20}}>💬</span>
                <span style={{
                  position:"absolute",top:-6,right:-8,
                  background:"#e53e3e",color:"white",borderRadius:"50%",
                  minWidth:18,height:18,fontSize:"0.65rem",fontWeight:800,
                  display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px",
                  boxShadow:"0 2px 6px rgba(229,62,62,0.5)",
                }}>{mensajesNoLeidos}</span>
              </div>
              <div style={{flex:1}}>
                <p style={{margin:0,fontWeight:700,fontSize:"0.85rem",color:THEME.gold}}>
                  {mensajesNoLeidos} mensaje{mensajesNoLeidos>1?"s":""} sin leer
                </p>
                <p style={{margin:0,fontSize:"0.75rem",color:THEME.muted}}>Ver conversaciones →</p>
              </div>
            </div>
          </a>
        )}
      </div>
      {showEnviarModal && ordenActiva && (
        <MarcarEnviadoModal
          orderId={ordenActiva.id}
          onClose={() => setShowEnviarModal(false)}
          onSuccess={refrescarOrden}
        />
      )}

      {showGaleria && todasLasFotos.length > 0 && (
        <div
          onClick={() => setShowGaleria(false)}
          style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(5,13,26,0.92)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, animation: "galeriaFadeIn 0.2s ease" }}
        >
          <button onClick={() => setShowGaleria(false)} style={{ position: "absolute", top: 18, right: 18, width: 38, height: 38, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.12)", color: "#fff", fontSize: 18, cursor: "pointer", zIndex: 10 }}>×</button>

          <div onClick={e => e.stopPropagation()} style={{ position: "relative", maxWidth: 720, width: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {todasLasFotos.length > 1 && (
              <button
                onClick={() => setFotoActual(p => (p - 1 + todasLasFotos.length) % todasLasFotos.length)}
                style={{ position: "absolute", left: -8, top: "50%", transform: "translateY(-50%)", width: 42, height: 42, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.12)", color: "#fff", fontSize: 20, cursor: "pointer", zIndex: 5 }}
              >‹</button>
            )}

            <img src={todasLasFotos[fotoActual]} alt={product.title + " foto " + (fotoActual + 1)} style={{ maxWidth: "100%", maxHeight: "78vh", borderRadius: 16, objectFit: "contain", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }} />

            {todasLasFotos.length > 1 && (
              <button
                onClick={() => setFotoActual(p => (p + 1) % todasLasFotos.length)}
                style={{ position: "absolute", right: -8, top: "50%", transform: "translateY(-50%)", width: 42, height: 42, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.12)", color: "#fff", fontSize: 20, cursor: "pointer", zIndex: 5 }}
              >›</button>
            )}
          </div>

          {todasLasFotos.length > 1 && (
            <div style={{ position: "absolute", bottom: 24, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 8 }}>
              {todasLasFotos.map((_: string, i: number) => (
                <button
                  key={i}
                  onClick={e => { e.stopPropagation(); setFotoActual(i); }}
                  style={{ width: i === fotoActual ? 22 : 8, height: 8, borderRadius: 4, border: "none", background: i === fotoActual ? "#1F6BFF" : "rgba(255,255,255,0.4)", cursor: "pointer", transition: "all 0.25s" }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes ofertaPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.04); } }
        @keyframes ofertaBlink { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes galeriaFadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
});
