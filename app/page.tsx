"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import InfiniteScroll from "react-infinite-scroll-component";
import { z } from "zod";

import { useProducts, FilterState } from "@/hooks/useProducts";
import { useToast } from "@/components/Toast";
import { productSchema, ProductFormData } from "@/utils/validations";
import { THEME, PRODUCT_STATUS, CITIES } from "@/lib/theme";
import { Button, OutlineButton, Input, Select, TextArea } from "@/components/FormComponents";
import { ProductCard } from "@/components/ProductCard";
import { OfferModal } from "@/components/OfferModal";
import { ReviewModal } from "@/components/ReviewModal";
import { SkeletonGrid } from "@/components/Skeleton";
import { formatMoney } from "@/lib/utils";

const extendedProductSchema = productSchema.extend({
  condition: z.enum(["NUEVO", "USADO"]),
});
type ExtendedProductFormData = z.infer<typeof extendedProductSchema>;

const STORAGE_KEYS = {
  FILTERS: "colbisnes_filters",
} as const;

const PAYMENT_METHODS = ["PSE", "Nequi", "Daviplata", "Visa", "Mastercard"] as const;

export default function Page() {
  const { data: session, status: sessionStatus } = useSession();
  const { showToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState<FilterState & { condition?: string }>(() => {
    const urlFilters = {
      searchQuery: searchParams.get("q") || "",
      city: searchParams.get("city") || "",
      minPrice: searchParams.get("minPrice") || "",
      maxPrice: searchParams.get("maxPrice") || "",
      status: searchParams.get("status") || "",
      condition: searchParams.get("condition") || "",
    };
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEYS.FILTERS);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return {
            searchQuery: urlFilters.searchQuery || parsed.searchQuery || "",
            city: urlFilters.city || parsed.city || "",
            minPrice: urlFilters.minPrice || parsed.minPrice || "",
            maxPrice: urlFilters.maxPrice || parsed.maxPrice || "",
            status: urlFilters.status || parsed.status || "",
            condition: urlFilters.condition || parsed.condition || "",
          };
        } catch {}
      }
    }
    return urlFilters;
  });

  const { products, loading, error, hasMore, fetchMore, refetch } = useProducts(filters);

  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [reviewingProduct, setReviewingProduct] = useState<any | null>(null);
  const [offers, setOffers] = useState<any[]>([]);
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [isSubmittingOffer, setIsSubmittingOffer] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [paymentModalProduct, setPaymentModalProduct] = useState<any | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  // Estados para imágenes
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isValid },
    watch,
  } = useForm<ExtendedProductFormData>({
    resolver: zodResolver(extendedProductSchema),
    defaultValues: { city: "Bogotá", condition: "NUEVO" },
    mode: "onChange",
  });

  const titleValue = watch("title");

  useEffect(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.append(key, value);
    });
    router.replace(`/?${params.toString()}`);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEYS.FILTERS, JSON.stringify(filters));
    }
  }, [filters, router]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  const fetchOffers = useCallback(async (productId: string) => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    setLoadingOffers(true);
    try {
      const res = await fetch(`/api/offers?productId=${encodeURIComponent(productId)}`, {
        signal: abortControllerRef.current.signal,
        cache: "no-store",
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `Error ${res.status}`);
      }
      const data = await res.json();
      setOffers(Array.isArray(data) ? data : []);
    } catch (err: any) {
      if (err.name !== "AbortError") {
        showToast(err.message || "Error cargando ofertas", "error");
      }
    } finally {
      setLoadingOffers(false);
      abortControllerRef.current = null;
    }
  }, [showToast]);

  useEffect(() => {
    if (selectedProductId) fetchOffers(selectedProductId);
    else setOffers([]);
  }, [selectedProductId, fetchOffers]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 5) {
      showToast("Máximo 5 imágenes por producto", "warning");
      return;
    }
    setImageFiles(files);
    setImagePreviews(files.map(f => URL.createObjectURL(f)));
  };

  const onPublish = useCallback(async (data: ExtendedProductFormData) => {
    if (sessionStatus !== "authenticated") {
      showToast("Debes iniciar sesión para publicar", "warning");
      return;
    }
    setUploadingImages(true);
    try {
      // 1. Subir imágenes a Cloudinary
      let imageUrls: string[] = [];
      if (imageFiles.length > 0) {
        const formDataImages = new FormData();
        imageFiles.forEach((file) => formDataImages.append("images", file));
        const uploadRes = await fetch("/api/upload-images", {
          method: "POST",
          credentials: "include",
          body: formDataImages,
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) throw new Error(uploadData.error || "Error al subir imágenes");
        imageUrls = uploadData.urls;
      }

      // 2. Crear producto con las URLs
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...data, images: imageUrls }),
      });
      const response = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(response.message || `Error ${res.status}`);
      reset();
      setImageFiles([]);
      setImagePreviews([]);
      await refetch();
      showToast("Producto publicado exitosamente", "success");
    } catch (err: any) {
      showToast(err.message || "Error al publicar", "error");
    } finally {
      setUploadingImages(false);
    }
  }, [sessionStatus, reset, refetch, showToast, imageFiles]);

  const handleMakeOffer = useCallback(async (productId: string, amount: number, message: string) => {
    if (sessionStatus !== "authenticated") {
      showToast("Inicia sesión para hacer una oferta", "warning");
      return;
    }
    setIsSubmittingOffer(true);
    try {
      const res = await fetch("/api/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ productId, amountCOP: amount, message: message?.trim() || null }),
      });
      const response = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(response.message || `Error ${res.status}`);
      showToast("Oferta enviada exitosamente", "success");
      await Promise.all([fetchOffers(productId), refetch()]);
    } catch (err: any) {
      showToast(err.message || "Error al crear la oferta", "error");
    } finally {
      setIsSubmittingOffer(false);
    }
  }, [sessionStatus, showToast, fetchOffers, refetch]);

  const handleUpdateOffer = useCallback(async (offerId: string, status: string) => {
    try {
      const res = await fetch("/api/offers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ offerId, status }),
      });
      const response = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(response.message || `Error ${res.status}`);
      if (selectedProductId) {
        await Promise.all([fetchOffers(selectedProductId), refetch()]);
      }
      showToast(`Oferta ${status === "ACCEPTED" ? "aceptada" : "rechazada"}`, "success");
    } catch (err: any) {
      showToast(err.message || "Error al actualizar la oferta", "error");
    }
  }, [selectedProductId, fetchOffers, refetch, showToast]);

  const handleMockPayment = useCallback(async (productId: string) => {
    try {
      const res = await fetch("/api/payments/mock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ productId }),
      });
      const response = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(response.message || `Error ${res.status}`);
      await Promise.all([refetch(), selectedProductId === productId && fetchOffers(productId)]);
      showToast("Pago procesado exitosamente", "success");
    } catch (err: any) {
      showToast(err.message || "Error al procesar el pago", "error");
    }
  }, [refetch, selectedProductId, fetchOffers, showToast]);

  const handlePaymentRequest = useCallback(async (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product || !product.seller) {
      showToast("No se pudo obtener la información del vendedor", "error");
      return;
    }
    try {
      const res = await fetch(`/api/users/${product.seller.id}`);
      if (!res.ok) throw new Error("Error al obtener datos de pago");
      const sellerData = await res.json();
      product.seller.nequiNumber = sellerData.nequiNumber;
      product.seller.brebId = sellerData.brebId;
    } catch (err) {
      console.error(err);
    }
    setPaymentModalProduct(product);
    setIsPaymentModalOpen(true);
  }, [products, showToast]);

  const handleConfirmDelivery = useCallback(async (productId: string) => {
    try {
      const res = await fetch("/api/payments/confirm-delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ productId }),
      });
      const response = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(response.message || `Error ${res.status}`);
      await Promise.all([refetch(), selectedProductId === productId && fetchOffers(productId)]);
      showToast("Entrega confirmada exitosamente", "success");
    } catch (err: any) {
      showToast(err.message || "Error al confirmar la entrega", "error");
    }
  }, [refetch, selectedProductId, fetchOffers, showToast]);

  const handleSubmitReview = useCallback(async (productId: string, rating: number, comment: string) => {
    if (rating < 1 || rating > 5) {
      showToast("La calificación debe ser entre 1 y 5 estrellas", "error");
      return;
    }
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ productId, rating, comment: comment?.trim() || undefined }),
      });
      const response = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(response.error || `Error ${res.status}`);
      showToast("Calificación enviada correctamente", "success");
      await refetch();
      setReviewingProduct(null);
    } catch (err: any) {
      showToast(err.message || "Error al enviar calificación", "error");
    }
  }, [refetch, showToast]);

  const clearFilters = useCallback(() => {
    setFilters({
      searchQuery: "",
      city: "",
      minPrice: "",
      maxPrice: "",
      status: "",
      condition: "",
    });
    if (typeof window !== "undefined") localStorage.removeItem(STORAGE_KEYS.FILTERS);
  }, []);

  const handleSearch = (e: React.FormEvent) => e.preventDefault();

  const productsCount = useMemo(() => products.length, [products]);
  const isAuthenticated = useMemo(() => sessionStatus === "authenticated", [sessionStatus]);

  const Header = useMemo(() => (
    <header style={{ background: THEME.primary, padding: "18px 28px", boxShadow: "0 10px 30px rgba(0,0,0,0.15)" }}>
      <div style={{ maxWidth: 1200, margin: "auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Link href="/" style={{ textDecoration: "none" }}>
          <h1 style={{ fontWeight: 800, fontSize: "1.6rem", color: "white", margin: 0 }}>COLBISNES</h1>
        </Link>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          {isAuthenticated && session?.user ? (
            <>
              <Link
                href={`/user/${session.user.id}`}
                style={{
                  color: "white",
                  textDecoration: "none",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 16px",
                  borderRadius: 30,
                  background: "rgba(255,255,255,0.1)",
                  transition: "background 0.2s",
                }}
              >
                <span>👤 {session.user?.name || session.user?.email}</span>
              </Link>
              <Button onClick={() => signOut()}>Cerrar sesión</Button>
            </>
          ) : (
            <>
              <Link href="/auth/login" style={{ textDecoration: "none" }}>
                <Button>Iniciar sesión</Button>
              </Link>
              <Link href="/auth/register" style={{ textDecoration: "none" }}>
                <Button>Registrarse</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  ), [isAuthenticated, session]);

  const ProductFormSection = useMemo(() => {
    if (!isAuthenticated) return null;
    return (
      <section style={{ background: THEME.surface, borderRadius: 20, padding: 24, border: `1px solid ${THEME.border}`, marginBottom: 40 }}>
        <h2 style={{ fontSize: "1.5rem", marginBottom: 16, color: THEME.primary }}>Publicar producto</h2>
        <form onSubmit={handleSubmit(onPublish)}>
          <Input placeholder="Título *" {...register('title')} error={errors.title?.message} />
          {titleValue && titleValue.length < 3 && (
            <p style={{ color: THEME.muted, fontSize: "0.8rem", marginTop: 4 }}>Mínimo 3 caracteres</p>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <Input placeholder="Precio COP *" type="number" {...register('priceCOP', { valueAsNumber: true })} error={errors.priceCOP?.message} step="1000" />
            <Select {...register('city')}>
              {CITIES.map(city => <option key={city} value={city}>{city}</option>)}
            </Select>
          </div>
          <div style={{ marginTop: 10 }}>
            <Select {...register('condition')}>
              <option value="NUEVO">Nuevo</option>
              <option value="USADO">Usado</option>
            </Select>
          </div>
          <TextArea placeholder="Descripción *" rows={4} {...register('description')} error={errors.description?.message} style={{ marginTop: 10 }} />

          {/* Imágenes */}
          <div style={{ marginTop: 16 }}>
            <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>Imágenes (máx 5)</label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageChange}
              disabled={uploadingImages}
              style={{
                padding: "8px",
                borderRadius: 8,
                border: `1px solid ${THEME.border}`,
                background: "white",
                width: "100%",
              }}
            />
            {imagePreviews.length > 0 && (
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                {imagePreviews.map((src, idx) => (
                  <img key={idx} src={src} alt={`preview-${idx}`} style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8 }} />
                ))}
              </div>
            )}
          </div>

          <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
            <Button type="submit" disabled={isSubmitting || !isValid || uploadingImages}>
              {uploadingImages ? "Subiendo imágenes..." : isSubmitting ? "Publicando..." : "Publicar"}
            </Button>
            <OutlineButton onClick={() => refetch()} disabled={loading}>Recargar</OutlineButton>
          </div>
        </form>
      </section>
    );
  }, [isAuthenticated, handleSubmit, onPublish, register, errors, isSubmitting, isValid, refetch, loading, titleValue, imagePreviews, uploadingImages]);

  const FilterSection = useMemo(() => (
    <section style={{ background: THEME.surface, borderRadius: 20, padding: 24, border: `1px solid ${THEME.border}`, marginBottom: 40 }}>
      <h2 style={{ fontSize: "1.5rem", marginBottom: 16, color: THEME.primary }}>Buscar productos</h2>
      <form onSubmit={handleSearch}>
        <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
          <Input
            placeholder="Buscar por título o descripción..."
            value={filters.searchQuery}
            onChange={(e) => setFilters(prev => ({ ...prev, searchQuery: e.target.value }))}
            style={{ flex: 2, minWidth: 250 }}
          />
          <Select value={filters.city} onChange={(e) => setFilters(prev => ({ ...prev, city: e.target.value }))} style={{ flex: 1, minWidth: 150 }}>
            <option value="">Todas las ciudades</option>
            {CITIES.map(city => <option key={city} value={city}>{city}</option>)}
          </Select>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <Input type="number" placeholder="Mín" value={filters.minPrice} onChange={(e) => setFilters(prev => ({ ...prev, minPrice: e.target.value }))} style={{ width: 100 }} min="0" step="1000" />
          <span>a</span>
          <Input type="number" placeholder="Máx" value={filters.maxPrice} onChange={(e) => setFilters(prev => ({ ...prev, maxPrice: e.target.value }))} style={{ width: 100 }} min="0" step="1000" />
          <Select value={filters.condition} onChange={(e) => setFilters(prev => ({ ...prev, condition: e.target.value }))} style={{ width: 120 }}>
            <option value="">Condición</option>
            <option value="NUEVO">Nuevo</option>
            <option value="USADO">Usado</option>
          </Select>
          <Select value={filters.status} onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))} style={{ width: 140 }}>
            <option value="">Todos</option>
            <option value={PRODUCT_STATUS.AVAILABLE}>Disponible</option>
            <option value={PRODUCT_STATUS.PAYMENT_PENDING}>Pago pendiente</option>
            <option value={PRODUCT_STATUS.IN_ESCROW}>En custodia</option>
            <option value={PRODUCT_STATUS.SOLD}>Vendido</option>
          </Select>
          <Button type="submit">Buscar</Button>
          <OutlineButton onClick={clearFilters}>Limpiar</OutlineButton>
        </div>
      </form>
    </section>
  ), [filters, clearFilters]);

  const Footer = useMemo(() => (
    <footer style={{ marginTop: 80, padding: 40, textAlign: "center", borderTop: `1px solid ${THEME.border}`, background: THEME.surface }}>
      <h3 style={{ fontSize: "1.2rem", marginBottom: 16, color: THEME.primary }}>Medios de pago aceptados</h3>
      <div style={{ display: "flex", justifyContent: "center", gap: 24, flexWrap: "wrap" }}>
        {PAYMENT_METHODS.map(method => (
          <span key={method} style={{ background: THEME.secondary, color: THEME.text, padding: "8px 20px", borderRadius: 30, fontWeight: 600 }}>
            {method}
          </span>
        ))}
      </div>
      <p style={{ marginTop: 24, color: THEME.muted }}>© {new Date().getFullYear()} COLBISNES - Todos los derechos reservados</p>
    </footer>
  ), []);

  return (
    <div style={{ minHeight: "100vh", background: THEME.background, color: THEME.text }}>
      {Header}
      <main style={{ maxWidth: 1200, margin: "auto", padding: "40px 20px" }}>
        {ProductFormSection}
        {FilterSection}

        <section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h2 style={{ fontSize: "1.5rem", color: THEME.primary }}>Productos</h2>
            <span style={{ background: THEME.border, padding: "6px 14px", borderRadius: 30, fontSize: "0.9rem" }}>
              {productsCount} encontrado{productsCount !== 1 ? 's' : ''}
            </span>
          </div>

          {error && (
            <div style={{ textAlign: "center", padding: 40, color: "red", background: "rgba(255,0,0,0.1)", borderRadius: 12, marginBottom: 20 }}>
              ⚠️ {error}
            </div>
          )}

          <InfiniteScroll
            dataLength={productsCount}
            next={fetchMore}
            hasMore={hasMore}
            loader={<SkeletonGrid count={4} />}
            endMessage={
              productsCount > 0 ? (
                <p style={{ textAlign: "center", padding: 20, color: THEME.muted }}>🎉 No hay más productos para mostrar</p>
              ) : null
            }
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 24 }}>
              {products.map((product) => {
                const isOwner = session?.user?.id === product.seller?.id;
                const pendingOffersCount = product._count?.offers || 0;
                return (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onSelect={setSelectedProductId}
                    onPaymentRequest={handlePaymentRequest}
                    onConfirmDelivery={handleConfirmDelivery}
                    onReviewClick={setReviewingProduct}
                    isSelected={selectedProductId === product.id}
                    isOwner={isOwner}
                    pendingOffersCount={pendingOffersCount}
                  />
                );
              })}
            </div>
          </InfiniteScroll>

          {!loading && productsCount === 0 && !error && (
            <div style={{ textAlign: "center", padding: 60, background: THEME.surface, borderRadius: 20, border: `1px solid ${THEME.border}` }}>
              <p style={{ fontSize: "1.2rem", color: THEME.muted }}>🔍 No se encontraron productos con los filtros actuales</p>
              <OutlineButton onClick={clearFilters} style={{ marginTop: 20 }}>Limpiar filtros</OutlineButton>
            </div>
          )}
        </section>

        {selectedProductId && (
          <OfferModal
            productId={selectedProductId}
            products={products}
            offers={offers}
            loading={loadingOffers || isSubmittingOffer}
            session={session}
            onClose={() => setSelectedProductId(null)}
            onCreateOffer={handleMakeOffer}
            onUpdateOffer={handleUpdateOffer}
          />
        )}

        {reviewingProduct && (
          <ReviewModal
            product={reviewingProduct}
            session={session}
            onClose={() => setReviewingProduct(null)}
            onSubmitReview={handleSubmitReview}
          />
        )}

        {isPaymentModalOpen && paymentModalProduct && (
          <div style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
            padding: 20,
          }}>
            <div style={{
              background: THEME.surface,
              borderRadius: 20,
              padding: "2rem",
              maxWidth: 500,
              width: "100%",
              maxHeight: "80vh",
              overflowY: "auto",
            }}>
              <h3 style={{ marginBottom: "1rem", color: THEME.primary }}>Pagar con Nequi / Bre-B</h3>
              <p><strong>Producto:</strong> {paymentModalProduct.title}</p>
              <p><strong>Monto:</strong> {formatMoney(paymentModalProduct.priceCOP)}</p>
              <p><strong>Vendedor:</strong> {paymentModalProduct.seller?.name || "Anónimo"}</p>
              <div style={{ marginTop: "1.5rem", padding: "1rem", background: THEME.border, borderRadius: 12 }}>
                <p><strong>Instrucciones de pago:</strong></p>
                <p>📱 <strong>Nequi:</strong> {paymentModalProduct.seller?.nequiNumber || "No registrado"}</p>
                <p>🏦 <strong>Bre-B ID:</strong> {paymentModalProduct.seller?.brebId || "No registrado"}</p>
                <p style={{ marginTop: "1rem", fontSize: "0.9rem", color: THEME.muted }}>
                  Realiza el pago a través de Nequi o Bre-B y luego confirma la transacción.
                </p>
              </div>
              <div style={{ marginTop: "1.5rem", display: "flex", gap: "1rem" }}>
                <Button onClick={() => {
                  handleMockPayment(paymentModalProduct.id);
                  setIsPaymentModalOpen(false);
                  setPaymentModalProduct(null);
                }}>
                  Ya pagué (confirmar)
                </Button>
                <OutlineButton onClick={() => {
                  setIsPaymentModalOpen(false);
                  setPaymentModalProduct(null);
                }}>
                  Cancelar
                </OutlineButton>
              </div>
            </div>
          </div>
        )}
      </main>
      {Footer}
    </div>
  );
}
