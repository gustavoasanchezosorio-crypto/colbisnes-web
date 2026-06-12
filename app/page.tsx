"use client";
import React, { useEffect, useState, useCallback, useMemo, useRef, Suspense } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import InfiniteScroll from "react-infinite-scroll-component";
import { z } from "zod";
import { useProducts, FilterState } from "@/hooks/useProducts";
import { useToast } from "@/components/Toast";
import { productSchema } from "@/utils/validations";
import { THEME, PRODUCT_STATUS, CITIES } from "@/lib/theme";
import { Button, OutlineButton, Input, Select, TextArea } from "@/components/FormComponents";
import { ProductCard } from "@/components/ProductCard";
import { OfferModal } from "@/components/OfferModal";
import { ReviewModal } from "@/components/ReviewModal";
import { SkeletonGrid } from "@/components/Skeleton";
import { formatMoney } from "@/lib/utils";

const extendedSchema = productSchema.extend({ condition: z.enum(["NUEVO", "USADO"]) });
type FormData = z.infer<typeof extendedSchema>;
const PAYMENT_METHODS = ["PSE", "Nequi", "Daviplata", "Visa", "Mastercard"] as const;
const FILTERS_KEY = "colbisnes_filters";

interface ImagePickerProps {
  files: File[];
  previews: string[];
  onChange: (files: File[], previews: string[]) => void;
  disabled?: boolean;
}

function ImagePicker({ files, previews, onChange, disabled }: ImagePickerProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const handleFileChange = (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const nf = [...files]; const np = [...previews];
    nf[idx] = file; np[idx] = URL.createObjectURL(file);
    onChange(nf, np); e.target.value = "";
  };
  const handleRemove = (idx: number) => {
    onChange(files.filter((_, i) => i !== idx), previews.filter((_, i) => i !== idx));
  };
  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[0,1,2,3,4].map(idx => (
          <div key={idx}>
            <input ref={el => { inputRefs.current[idx] = el; }} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleFileChange(idx, e)} disabled={disabled} />
            <div onClick={() => { if (!previews[idx] && !disabled) inputRefs.current[idx]?.click(); }}
              style={{ position: "relative", width: 86, height: 86, borderRadius: 12, border: `2px dashed ${previews[idx] ? THEME.primary : THEME.border}`, background: previews[idx] ? "transparent" : "#FAFBFF", display: "flex", alignItems: "center", justifyContent: "center", cursor: previews[idx] ? "default" : "pointer", overflow: "hidden" }}>
              {previews[idx] ? (
                <>
                  <img src={previews[idx]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <button type="button" onClick={e => { e.stopPropagation(); handleRemove(idx); }} style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: "50%", background: "rgba(239,68,68,0.92)", border: "none", color: "white", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900 }}>×</button>
                  <button type="button" onClick={e => { e.stopPropagation(); inputRefs.current[idx]?.click(); }} style={{ position: "absolute", bottom: 4, right: 4, width: 22, height: 22, borderRadius: "50%", background: "rgba(0,89,159,0.85)", border: "none", color: "white", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✎</button>
                </>
              ) : (
                <span style={{ fontSize: 24, color: THEME.muted }}>+</span>
              )}
            </div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 11, color: THEME.muted, margin: "6px 0 0" }}>Toca + para agregar · × para eliminar · ✎ para cambiar</p>
    </div>
  );
}

function PageInner() {
  const { data: session, status: sessionStatus } = useSession();
  const { showToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<FilterState & { condition?: string }>(() => {
    const url = { searchQuery: searchParams.get("q") || "", city: searchParams.get("city") || "", minPrice: searchParams.get("minPrice") || "", maxPrice: searchParams.get("maxPrice") || "", status: searchParams.get("status") || "", condition: searchParams.get("condition") || "" };
    if (typeof window !== "undefined") { try { const s = JSON.parse(localStorage.getItem(FILTERS_KEY) || "{}"); return Object.fromEntries(Object.entries(url).map(([k,v]) => [k, v || (s as any)[k] || ""])) as typeof url; } catch {} }
    return url;
  });
  const { products, loading, error, hasMore, fetchMore, refetch } = useProducts(filters);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [reviewingProduct, setReviewingProduct] = useState<any | null>(null);
  const [offers, setOffers] = useState<any[]>([]);
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [isSubmittingOffer, setIsSubmittingOffer] = useState(false);
  const [paymentModalProduct, setPaymentModalProduct] = useState<any | null>(null);
  const [showPublishForm, setShowPublishForm] = useState(false);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(extendedSchema),
    defaultValues: { city: "Bogotá", condition: "NUEVO" },
    mode: "onChange",
  });
  useEffect(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k,v]) => { if (v) params.append(k, v); });
    router.replace(`/?${params.toString()}`);
    if (typeof window !== "undefined") localStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
  }, [filters, router]);
  useEffect(() => () => { abortRef.current?.abort(); }, []);
  const fetchOffers = useCallback(async (productId: string) => {
    abortRef.current?.abort(); abortRef.current = new AbortController();
    setLoadingOffers(true);
    try {
      const res = await fetch(`/api/offers?productId=${encodeURIComponent(productId)}`, { signal: abortRef.current.signal, cache: "no-store" });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setOffers(Array.isArray(data) ? data : []);
    } catch (err: any) { if (err.name !== "AbortError") showToast(err.message || "Error cargando ofertas", "error"); }
    finally { setLoadingOffers(false); abortRef.current = null; }
  }, [showToast]);
  useEffect(() => { if (selectedProductId) fetchOffers(selectedProductId); else setOffers([]); }, [selectedProductId, fetchOffers]);
  const onPublish = useCallback(async (data: FormData) => {
    if (sessionStatus !== "authenticated") { showToast("Debes iniciar sesion para publicar", "warning"); return; }
    setUploadingImages(true);
    try {
      let imageUrls: string[] = [];
      if (imageFiles.length > 0) {
        const fd = new FormData();
        imageFiles.forEach(f => fd.append("images", f));
        const upRes = await fetch("/api/upload-images", { method: "POST", credentials: "include", body: fd });
        const upData = await upRes.json();
        if (!upRes.ok) throw new Error(upData.error || "Error al subir imagenes");
        imageUrls = upData.urls;
      }
      const res = await fetch("/api/products", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ ...data, images: imageUrls }) });
      const resp = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(resp.message || `Error ${res.status}`);
      reset(); setImageFiles([]); setImagePreviews([]); setShowPublishForm(false);
      await refetch(); showToast("Producto publicado exitosamente!", "success");
    } catch (err: any) { showToast(err.message || "Error al publicar", "error"); }
    finally { setUploadingImages(false); }
  }, [sessionStatus, reset, refetch, showToast, imageFiles]);
  const handleMakeOffer = useCallback(async (productId: string, amount: number, message: string) => {
    if (sessionStatus !== "authenticated") { showToast("Inicia sesion para hacer una oferta", "warning"); return; }
    setIsSubmittingOffer(true);
    try {
      const res = await fetch("/api/offers", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ productId, amountCOP: amount, message: message?.trim() || null }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || `Error ${res.status}`);
      showToast("Oferta enviada exitosamente", "success");
      await Promise.all([fetchOffers(productId), refetch()]);
    } catch (err: any) { showToast(err.message || "Error al crear la oferta", "error"); }
    finally { setIsSubmittingOffer(false); }
  }, [sessionStatus, showToast, fetchOffers, refetch]);
  const handleUpdateOffer = useCallback(async (offerId: string, status: string) => {
    try {
      const res = await fetch("/api/offers", { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ offerId, status }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message);
      if (selectedProductId) await Promise.all([fetchOffers(selectedProductId), refetch()]);
      showToast(`Oferta ${status === "ACCEPTED" ? "aceptada" : "rechazada"}`, "success");
    } catch (err: any) { showToast(err.message || "Error al actualizar la oferta", "error"); }
  }, [selectedProductId, fetchOffers, refetch, showToast]);
  const handlePaymentRequest = useCallback(async (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product?.seller) { showToast("No se pudo obtener la informacion del vendedor", "error"); return; }
    try { const res = await fetch(`/api/users/${product.seller.id}`); if (res.ok) { const d = await res.json(); (product.seller as any).nequiNumber = d.nequiNumber; (product.seller as any).brebId = d.brebId; } } catch {}
    setPaymentModalProduct(product);
  }, [products, showToast]);
  const handleConfirmDelivery = useCallback(async (productId: string) => {
    try {
      const res = await fetch("/api/payments/confirm-delivery", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ productId }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message);
      await Promise.all([refetch(), selectedProductId === productId && fetchOffers(productId)]);
      showToast("Entrega confirmada exitosamente", "success");
    } catch (err: any) { showToast(err.message || "Error al confirmar la entrega", "error"); }
  }, [refetch, selectedProductId, fetchOffers, showToast]);
  const handleSubmitReview = useCallback(async (productId: string, rating: number, comment: string) => {
    try {
      const res = await fetch("/api/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ productId, rating, comment: comment?.trim() || undefined }) });
      const resp = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(resp.error || `Error ${res.status}`);
      showToast("Calificacion enviada correctamente", "success");
      await refetch(); setReviewingProduct(null);
    } catch (err: any) { showToast(err.message || "Error al enviar calificacion", "error"); }
  }, [refetch, showToast]);
  const clearFilters = useCallback(() => {
    setFilters({ searchQuery: "", city: "", minPrice: "", maxPrice: "", status: "", condition: "" });
    if (typeof window !== "undefined") localStorage.removeItem(FILTERS_KEY);
  }, []);
  const isAuthenticated = sessionStatus === "authenticated";
  const productsCount = products.length;
  const hasActiveFilters = Object.values(filters).some(Boolean);

  return (
    <div style={{ minHeight: "100vh", background: THEME.background, color: THEME.text }}>
      <header style={{ background: `linear-gradient(135deg,#003f7a,${THEME.primary},#4c8cff)`, padding: "0 24px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 20px rgba(0,89,159,0.3)" }}>
        <Link href="/" style={{ textDecoration: "none" }}>
          <span style={{ fontWeight: 900, fontSize: 20, color: "white", letterSpacing: "0.05em" }}>COLBISNES</span>
        </Link>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {isAuthenticated && session?.user ? (
            <>
              <button onClick={() => setShowPublishForm(!showPublishForm)} style={{ padding: "7px 16px", borderRadius: 20, background: showPublishForm ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.15)", border: "1.5px solid rgba(255,255,255,0.4)", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                {showPublishForm ? "✕ Cerrar" : "+ Publicar"}
              </button>
              <Link href={`/user/${session.user.id}`} style={{ color: "rgba(255,255,255,0.9)", textDecoration: "none", display: "flex", alignItems: "center", gap: 7, padding: "6px 12px", borderRadius: 20, background: "rgba(255,255,255,0.12)", fontSize: 13, fontWeight: 600 }}>
                <span style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, border: "1.5px solid rgba(255,255,255,0.4)" }}>
                  {(session.user?.name || session.user?.email || "U")[0].toUpperCase()}
                </span>
              </Link>
              <button onClick={() => signOut()} style={{ padding: "7px 14px", borderRadius: 20, border: "1.5px solid rgba(255,255,255,0.35)", background: "transparent", color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Salir</button>
            </>
          ) : (
            <>
              <Link href="/auth/login" style={{ color: "rgba(255,255,255,0.9)", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>Entrar</Link>
              <Link href="/auth/register" style={{ padding: "7px 16px", borderRadius: 20, background: "rgba(255,255,255,0.2)", color: "white", textDecoration: "none", fontSize: 13, fontWeight: 700, border: "1.5px solid rgba(255,255,255,0.4)" }}>Registrarse</Link>
            </>
          )}
        </div>
      </header>
      <main style={{ maxWidth: 1160, margin: "auto", padding: "28px 16px 60px" }}>
        {isAuthenticated && showPublishForm && (
          <div style={{ background: THEME.surface, borderRadius: 20, padding: "24px 20px", border: `1px solid ${THEME.border}`, marginBottom: 24, boxShadow: "0 4px 20px rgba(0,89,159,0.08)" }}>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: THEME.primary, margin: "0 0 18px" }}>Publicar producto</h2>
            <form onSubmit={handleSubmit(onPublish)}>
              <div style={{ display: "grid", gap: 12 }}>
                <Input placeholder="Titulo del producto *" {...register("title")} />
                {errors.title && <p style={{ color: "red", fontSize: 12, margin: "-8px 0 0" }}>{errors.title.message}</p>}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  <Input placeholder="Precio COP *" type="text" inputMode="numeric" {...register("priceCOP", { setValueAs: (v) => parseInt(String(v).replace(/\D/g, "")) || 0 })} />
                  <Select {...register("city")}>{CITIES.map(c => <option key={c} value={c}>{c}</option>)}</Select>
                  <Select {...register("condition")}><option value="NUEVO">Nuevo</option><option value="USADO">Usado</option></Select>
                </div>
                {errors.priceCOP && <p style={{ color: "red", fontSize: 12, margin: "-8px 0 0" }}>{errors.priceCOP.message}</p>}
                <TextArea placeholder="Descripcion detallada *" rows={3} {...register("description")} />
                {errors.description && <p style={{ color: "red", fontSize: 12, margin: "-8px 0 0" }}>{errors.description.message}</p>}
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 8px" }}>Fotos del producto (max 5)</p>
                  <ImagePicker files={imageFiles} previews={imagePreviews} onChange={(f,p) => { setImageFiles(f); setImagePreviews(p); }} disabled={uploadingImages} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                <Button type="submit" disabled={isSubmitting || uploadingImages}>{uploadingImages ? "Subiendo..." : isSubmitting ? "Publicando..." : "Publicar"}</Button>
                <OutlineButton type="button" onClick={() => { reset(); setImageFiles([]); setImagePreviews([]); setShowPublishForm(false); }}>Cancelar</OutlineButton>
              </div>
            </form>
          </div>
        )}
        <div style={{ background: THEME.surface, borderRadius: 16, padding: "14px 16px", border: `1px solid ${THEME.border}`, marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Input placeholder="Buscar productos..." value={filters.searchQuery} onChange={e => setFilters(prev => ({ ...prev, searchQuery: e.target.value }))} style={{ flex: 1, minWidth: 180 }} />
            <Select value={filters.city} onChange={e => setFilters(prev => ({ ...prev, city: e.target.value }))} style={{ width: 140 }}>
              <option value="">Todas las ciudades</option>
              {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
            <Select value={filters.status} onChange={e => setFilters(prev => ({ ...prev, status: e.target.value }))} style={{ width: 140 }}>
              <option value="">Todos</option>
              <option value={PRODUCT_STATUS.AVAILABLE}>Disponible</option>
              <option value={PRODUCT_STATUS.PAYMENT_PENDING}>Pago pendiente</option>
              <option value={PRODUCT_STATUS.IN_ESCROW}>En custodia</option>
              <option value={PRODUCT_STATUS.SOLD}>Vendido</option>
            </Select>
            {hasActiveFilters && <OutlineButton onClick={clearFilters}>Limpiar</OutlineButton>}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: THEME.primary, margin: 0 }}>Productos</h2>
          <span style={{ background: THEME.border, padding: "5px 14px", borderRadius: 20, fontSize: 13 }}>{productsCount} encontrado{productsCount !== 1 ? "s" : ""}</span>
        </div>
        {error && <div style={{ padding: 20, background: "#FEE2E2", borderRadius: 12, color: "#EF4444", marginBottom: 16 }}>⚠️ {error}</div>}
        <InfiniteScroll dataLength={productsCount} next={fetchMore} hasMore={hasMore} loader={<SkeletonGrid count={4} />} endMessage={productsCount > 0 ? <p style={{ textAlign: "center", padding: 20, color: THEME.muted }}>No hay mas productos</p> : null}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 20 }}>
            {products.map(product => (
              <ProductCard key={product.id} product={product} onSelect={setSelectedProductId} onPaymentRequest={handlePaymentRequest} onConfirmDelivery={handleConfirmDelivery} onReviewClick={setReviewingProduct} isSelected={selectedProductId === product.id} isOwner={session?.user?.id === product.seller?.id} pendingOffersCount={product._count?.offers || 0} />
            ))}
          </div>
        </InfiniteScroll>
        {!loading && productsCount === 0 && !error && (
          <div style={{ textAlign: "center", padding: 60, background: THEME.surface, borderRadius: 20, border: `2px dashed ${THEME.border}` }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>🔍</div>
            <p style={{ fontSize: 16, color: THEME.muted, margin: "0 0 16px" }}>No se encontraron productos</p>
            {hasActiveFilters && <OutlineButton onClick={clearFilters}>Limpiar filtros</OutlineButton>}
          </div>
        )}
      </main>
      <footer style={{ borderTop: `1px solid ${THEME.border}`, background: THEME.surface, padding: "32px 24px" }}>
        <div style={{ maxWidth: 1160, margin: "auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 16, color: THEME.primary }}>COLBISNES</div>
            <p style={{ fontSize: 12, color: THEME.muted, margin: "3px 0 0" }}>© {new Date().getFullYear()} Colbisnes — La mejor tienda de segunda mano de Colombia</p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {PAYMENT_METHODS.map(m => <span key={m} style={{ padding: "5px 14px", borderRadius: 20, background: THEME.secondary, color: THEME.text, fontSize: 12, fontWeight: 700 }}>{m}</span>)}
          </div>
        </div>
      </footer>
      {selectedProductId && <OfferModal productId={selectedProductId} products={products} offers={offers} loading={loadingOffers || isSubmittingOffer} session={session} onClose={() => setSelectedProductId(null)} onCreateOffer={handleMakeOffer} onUpdateOffer={handleUpdateOffer} />}
      {reviewingProduct && <ReviewModal product={reviewingProduct} session={session} onClose={() => setReviewingProduct(null)} onSubmitReview={handleSubmitReview} />}
      {paymentModalProduct && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 20, backdropFilter: "blur(4px)" }} onClick={e => e.target === e.currentTarget && setPaymentModalProduct(null)}>
          <div style={{ background: THEME.surface, borderRadius: 24, padding: "28px 24px", maxWidth: 460, width: "100%", boxShadow: "0 24px 80px rgba(0,0,0,0.2)" }}>
            <h3 style={{ margin: "0 0 16px", color: THEME.primary, fontSize: 18, fontWeight: 800 }}>Pagar con Nequi / Bre-B</h3>
            <div style={{ padding: "14px 16px", background: "#F0F6FF", borderRadius: 12, marginBottom: 16 }}>
              <p style={{ margin: "0 0 4px", fontWeight: 700 }}>{paymentModalProduct.title}</p>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 900, color: THEME.primary }}>{formatMoney(paymentModalProduct.priceCOP)}</p>
            </div>
            <div style={{ padding: "14px 16px", background: THEME.border, borderRadius: 12, marginBottom: 20 }}>
              <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: 14 }}>Datos del vendedor:</p>
              <p style={{ margin: "0 0 4px", fontSize: 14 }}>📱 <strong>Nequi:</strong> {paymentModalProduct.seller?.nequiNumber || "No registrado"}</p>
              <p style={{ margin: "0 0 8px", fontSize: 14 }}>🏦 <strong>Bre-B:</strong> {paymentModalProduct.seller?.brebId || "No registrado"}</p>
              <p style={{ fontSize: 12, color: THEME.muted, margin: 0 }}>Realiza el pago y luego confirma.</p>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Button onClick={async () => {
                try {
                  const res = await fetch("/api/payments/mock", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ productId: paymentModalProduct.id }) });
                  if (!res.ok) throw new Error("Error al procesar pago");
                  showToast("Pago confirmado exitosamente", "success");
                  await refetch(); setPaymentModalProduct(null);
                } catch (err: any) { showToast(err.message, "error"); }
              }}>Ya pague</Button>
              <OutlineButton onClick={() => setPaymentModalProduct(null)}>Cancelar</OutlineButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>Cargando...</div>}>
      <PageInner />
    </Suspense>
  );
}
