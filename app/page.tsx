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
import { useNotifications } from "@/context/NotificationContext";
import { productSchema } from "@/utils/validations";
import { THEME, PRODUCT_STATUS, CITIES, CATEGORIES } from "@/lib/theme";
import { Button, OutlineButton, Input, Select, TextArea } from "@/components/FormComponents";
import { ProductCard } from "@/components/ProductCard";
import { OfferModal } from "@/components/OfferModal";
import { ReviewModal } from "@/components/ReviewModal";
import { SkeletonGrid } from "@/components/Skeleton";
import { formatMoney } from "@/lib/utils";
import TrackingOverlay from "@/components/TrackingOverlay";

const extendedSchema = productSchema.extend({ condition: z.enum(["NUEVO", "USADO"]) });
type FormData = z.infer<typeof extendedSchema>;

// Solo letras, tildes, espacios y guiones (sin números ni caracteres especiales)
function soloLetras(e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
  const allowed = /^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ\s\-',.()]+$/;
  if (e.key.length === 1 && !allowed.test(e.key)) e.preventDefault();
}

// Formatea número con puntos de miles colombianos: 10000 → "10.000"
function formatMiles(value: string): string {
  const num = value.replace(/\D/g, "");
  if (!num) return "";
  return parseInt(num).toLocaleString("es-CO");
}
function parseMiles(value: string): number {
  return parseInt(value.replace(/\./g, "").replace(/,/g, "")) || 0;
}
const PAYMENT_METHODS = [
  { label: "Nequi", logo: "/logos/nequi.svg" },
  { label: "Bre-B", logo: "/logos/breb.svg" },
  { label: "Daviplata", logo: "/logos/daviplata.svg" },
  { label: "Visa", logo: "/logos/visa.svg" },
  { label: "Mastercard", logo: "/logos/mastercard.svg" },
  { label: "ARQ", logo: "/logos/arq.svg" },
  { label: "Global66", logo: "/logos/global66.svg" },
  { label: "USDT", logo: "/logos/usdt.png" },
  { label: "BNB", logo: "/logos/bnb.png" },
] as const;
function filtrarOfertasVisibles(offers: any[], product: any) {
  if (!product) return offers;
  if (product.status === "AVAILABLE") return offers;
  return offers.filter((o: any) => o.id === product.acceptedOfferId);
}
const FILTERS_KEY = "colbisnes_filters";

interface ImagePickerProps {
  files: File[];
  previews: string[];
  onChange: (files: File[], previews: string[]) => void;
  disabled?: boolean;
}

async function normalizarHeic(file: File): Promise<File> {
  const esHeic = /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
  if (!esHeic) return file;
  try {
    // Con timeout: algunos HEIC (ej. contenedores multi-imagen de Live Photos) hacen que
    // heic2any se cuelgue en vez de fallar rápido. Si tarda demasiado, seguimos con el
    // archivo original — el backend igual lo transcodifica con Cloudinary al subirlo.
    const conversion = (async () => {
      const heic2any = (await import("heic2any")).default;
      const resultado = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
      const blob = Array.isArray(resultado) ? resultado[0] : resultado;
      return new File([blob], file.name.replace(/\.hei[cf]$/i, ".jpg"), { type: "image/jpeg" });
    })();
    const timeout = new Promise<File>((resolve) => setTimeout(() => resolve(file), 8000));
    return await Promise.race([conversion, timeout]);
  } catch {
    // Si la conversión falla (formato corrupto, etc.) seguimos con el archivo original;
    // el backend igual lo transcodifica al subirlo (Cloudinary maneja HEIC/HEIF).
    return file;
  }
}

function comprimirImagen(file: File, maxAncho = 1600, calidad = 0.78): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => {
      img.onload = () => {
        let { width, height } = img;
        if (width > maxAncho) {
          height = Math.round((height * maxAncho) / width);
          width = maxAncho;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(file); return; }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (!blob) { resolve(file); return; }
          const comprimido = new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
          resolve(comprimido);
        }, "image/jpeg", calidad);
      };
      img.onerror = () => resolve(file);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("No se pudo leer la imagen"));
    reader.readAsDataURL(file);
  });
}

function ImagePicker({ files, previews, onChange, disabled }: ImagePickerProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const handleFileChange = async (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (!selected.length) return;
    e.target.value = "";
    const nf = [...files]; const np = [...previews];
    let slot = idx;
    for (const file of selected) {
      if (slot > 4) break;
      let finalFile = file;
      // HEIC/HEIF (fotos de iPhone) no lo decodifica <canvas> en la mayoría de navegadores,
      // así que primero se convierte con una librería dedicada (heic2any) a JPEG real.
      try { finalFile = await normalizarHeic(finalFile); } catch { /* sigue con el original */ }
      // Luego normalizamos siempre a JPEG (no solo cuando pesa mucho): esto evita que otros
      // formatos lleguen con un mediaType que Chucho Bot no reconoce, y de paso comprime
      // las fotos que pesan más de 350KB.
      try { finalFile = await comprimirImagen(finalFile, finalFile.size > 350 * 1024 ? 1600 : 2400); } catch { /* sigue con el archivo normalizado */ }
      nf[slot] = finalFile; np[slot] = URL.createObjectURL(finalFile);
      slot++;
    }
    onChange(nf.slice(0, 5), np.slice(0, 5));
  };
  const handleRemove = (idx: number) => {
    onChange(files.filter((_, i) => i !== idx), previews.filter((_, i) => i !== idx));
  };
  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[0,1,2,3,4].map(idx => (
          <div key={idx}>
            <input ref={el => { inputRefs.current[idx] = el; }} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => handleFileChange(idx, e)} disabled={disabled} />
            <div onClick={() => { if (!previews[idx] && !disabled) inputRefs.current[idx]?.click(); }}
              style={{ position: "relative", width: 86, height: 86, borderRadius: 12, border: `2px dashed ${previews[idx] ? THEME.gold : THEME.border}`, background: previews[idx] ? "transparent" : "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", cursor: previews[idx] ? "default" : "pointer", overflow: "hidden" }}>
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

  useEffect(() => {
    const trackingId = searchParams.get("tracking");
    if (trackingId) {
      setTrackingOrderId(trackingId);
      const newUrl = window.location.pathname;
      window.history.replaceState({}, "", newUrl);
    }
  }, [searchParams]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [reviewingProduct, setReviewingProduct] = useState<any | null>(null);
  const [offers, setOffers] = useState<any[]>([]);
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [isSubmittingOffer, setIsSubmittingOffer] = useState(false);
  const [paymentModalProduct, setPaymentModalProduct] = useState<any | null>(null);
  const [showPublishForm, setShowPublishForm] = useState(false);
  const publishFormRef = useRef<HTMLDivElement | null>(null);

  // Al abrir el formulario de publicar, llevar la vista hacia él. El botón vive
  // en el header y el formulario aparece más abajo; sin esto el usuario quedaba
  // mirando el mismo punto y no veía que el formulario se había abierto.
  useEffect(() => {
    if (showPublishForm) {
      requestAnimationFrame(() => {
        publishFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [showPublishForm]);
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [bluAnalizando, setBluAnalizando] = useState(false);
  const [bluSugerencia, setBluSugerencia] = useState<{ tituloSugerido: string; descripcionSugerida?: string; categoriaSugerida?: string; condicionSugerida?: "NUEVO" | "USADO"; tipoArticulo: string; marca: string | null; modelo: string | null; color: string | null } | null>(null);
  const [bluError, setBluError] = useState<string | null>(null);
  const bluAnalizadoRef = useRef<string | null>(null);

  const leerComoBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] || "");
    reader.onerror = () => reject(new Error("No pudimos leer la imagen"));
    reader.readAsDataURL(file);
  });

  // Analiza automaticamente todas las fotos del producto para sugerir titulo, descripcion,
  // categoria y condicion (asistente Chucho Bot), al estilo de apps como Wallapop.
  useEffect(() => {
    if (!imageFiles.length) {
      bluAnalizadoRef.current = null;
      setBluSugerencia(null);
      setBluAnalizando(false);
      setBluError(null);
      return;
    }
    const firma = imageFiles.map(f => `${f.name}_${f.size}_${f.lastModified}`).join("|");
    if (bluAnalizadoRef.current === firma) return;
    bluAnalizadoRef.current = firma;
    setBluSugerencia(null);
    setBluError(null);
    setBluAnalizando(true);
    (async () => {
      try {
        const imagenes = await Promise.all(imageFiles.map(async file => ({
          imageBase64: await leerComoBase64(file),
          mediaType: file.type,
        })));
        if (bluAnalizadoRef.current !== firma) return; // el usuario ya cambio las fotos
        const res = await fetch("/api/blu/analizar-foto", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ imagenes }),
        });
        const data = await res.json().catch(() => ({}));
        if (bluAnalizadoRef.current !== firma) return;
        if (res.ok && data.sugerencia) {
          setBluSugerencia(data.sugerencia);
        } else {
          setBluError(data?.error || "No pudimos analizar la foto. Puedes seguir publicando escribiendo el título manualmente.");
        }
      } catch {
        // La sugerencia de Chucho Bot es opcional: si falla, no bloquea publicar
        if (bluAnalizadoRef.current === firma) setBluError("No pudimos analizar la foto (sin conexión). Puedes seguir publicando escribiendo el título manualmente.");
      } finally {
        if (bluAnalizadoRef.current === firma) setBluAnalizando(false);
      }
    })();
  }, [imageFiles]);
  const [precioDisplay, setPrecioDisplay] = useState("");
  const { unreadTotal, nudgeTick } = useNotifications();
  const [unreadByProduct, setUnreadByProduct] = useState<Record<string, number>>({});
  const [kycPendiente, setKycPendiente] = useState(false);
  const [nudgeActive, setNudgeActive] = useState(false);

  // El sonido/vibración de notificación ahora se dispara de forma global desde
  // NotificationProvider (context/NotificationContext.tsx), montado en app/layout.tsx,
  // así funciona en cualquier página, no solo en el home. Aquí solo escuchamos
  // "nudgeTick" para mostrar el aviso visual (temblor + toast) propio de esta página.
  const seenTickRef = useRef<number | null>(null);
  useEffect(() => {
    if (seenTickRef.current === null) { seenTickRef.current = nudgeTick; return; }
    if (nudgeTick === seenTickRef.current) return;
    seenTickRef.current = nudgeTick;
    setNudgeActive(true);
    const t = setTimeout(() => setNudgeActive(false), 2200);
    return () => clearTimeout(t);
  }, [nudgeTick]);

  // Verificar KYC del usuario logueado
  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    fetch("/api/kyc/status", { credentials: "include" })
      .then(r => r.json())
      .then(d => { if (d.kycStatus && d.kycStatus !== "approved") setKycPendiente(true); })
      .catch(() => {});
  }, [sessionStatus]);

  // Poll unread per owned product every 5s (for card badges)
  useEffect(() => {
    if (sessionStatus !== "authenticated" || !session?.user?.id || products.length === 0) return;
    const ownedIds = products.filter(p => p.seller?.id === session.user?.id).map(p => p.id);
    if (ownedIds.length === 0) return;
    const fetchAll = () => {
      Promise.all(
        ownedIds.map(id =>
          fetch(`/api/messages/unread?productId=${id}`)
            .then(r => r.json())
            .then(d => ({ id, count: typeof d.count === "number" ? d.count : 0 }))
            .catch(() => ({ id, count: 0 }))
        )
      ).then(results => {
        setUnreadByProduct(Object.fromEntries(results.map(r => [r.id, r.count])));
      });
    };
    fetchAll();
    const iv = setInterval(fetchAll, 5000);
    return () => clearInterval(iv);
  }, [sessionStatus, session?.user?.id, products]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
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
        for (const file of imageFiles) {
          const fd = new FormData();
          fd.append("images", file);
          const upRes = await fetch("/api/upload-images", { method: "POST", credentials: "include", body: fd });
          const upText = await upRes.text();
          let upData: any = {};
          try { upData = JSON.parse(upText); } catch { upData = { error: "Respuesta invalida del servidor (" + upRes.status + ")" }; }
          if (!upRes.ok) throw new Error(upData.error || ("La imagen \"" + file.name + "\" es muy pesada o el servidor fallo al subirla"));
          if (upData.urls && upData.urls.length) imageUrls.push(upData.urls[0]);
        }
      }
      const res = await fetch("/api/products", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ ...data, images: imageUrls }) });
      const resp = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (resp.kycRequired) {
          showToast("Debes verificar tu identidad antes de publicar. Redirigiendo...", "warning");
          setTimeout(() => { window.location.href = "/kyc"; }, 1800);
          return;
        }
        throw new Error(resp.error || resp.message || `Error ${res.status}`);
      }
      reset(); setImageFiles([]); setImagePreviews([]); setShowPublishForm(false); setPrecioDisplay("");
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
      if (!res.ok) {
        const resp = await res.json().catch(() => ({}));
        if (resp.kycRequired) {
          showToast("Debes verificar tu identidad antes de aceptar ofertas. Redirigiendo...", "warning");
          setTimeout(() => { window.location.href = "/kyc"; }, 1800);
          return;
        }
        throw new Error(resp.error || resp.message || `Error ${res.status}`);
      }
      if (selectedProductId) await Promise.all([fetchOffers(selectedProductId), refetch()]);
      showToast(`Oferta ${status === "ACCEPTED" ? "aceptada" : "rechazada"}`, "success");
    } catch (err: any) { showToast(err.message || "Error al actualizar la oferta", "error"); }
  }, [selectedProductId, fetchOffers, refetch, showToast]);
  const handlePaymentRequest = useCallback(async (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product?.seller) { showToast("No se pudo obtener la informacion del vendedor", "error"); return; }
    try { const res = await fetch(`/api/users/${product.seller.id}`); if (res.ok) { const d = await res.json(); (product.seller as any).nequiNumber = d.nequiNumber; (product.seller as any).brebId = d.brebId; } } catch {}
    window.location.href = `/product/${product.id}`;
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
    <div style={{ minHeight: "100vh", background: THEME.background, color: THEME.text, animation: nudgeActive ? "nudgeSoftShake 0.5s ease-out" : "none" }}>

      {/* Aviso elegante — toast que se desliza suave desde arriba */}
      {nudgeActive && (
        <div style={{
          position: "fixed", top: 18, left: 0, right: 0, zIndex: 9999, pointerEvents: "none",
          display: "flex", justifyContent: "center",
          animation: "nudgeSlideIn 0.38s cubic-bezier(0.22,1,0.36,1)",
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 12,
            background: `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`, color: "white",
            padding: "0.85rem 1.4rem", borderRadius: 16,
            fontSize: "0.98rem", fontWeight: 800,
            boxShadow: "0 12px 34px rgba(0,63,122,0.35), 0 2px 8px rgba(0,0,0,0.18)",
            border: "1px solid rgba(255,205,0,0.55)", maxWidth: "90vw",
          }}>
            <span style={{
              width: 34, height: 34, borderRadius: 10, flexShrink: 0,
              background: "rgba(255,205,0,0.18)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem",
            }}>💬</span>
            <div style={{ textAlign: "left", lineHeight: 1.2 }}>
              Nuevo mensaje
              <div style={{ fontSize: "0.78rem", fontWeight: 600, opacity: 0.8, marginTop: 2 }}>
                Alguien quiere hablar contigo
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes nudgeSoftShake {
          0%   { transform: translateX(0); }
          15%  { transform: translateX(-5px); }
          30%  { transform: translateX(5px); }
          45%  { transform: translateX(-3px); }
          60%  { transform: translateX(3px); }
          75%  { transform: translateX(-1.5px); }
          100% { transform: translateX(0); }
        }
        @keyframes nudgeSlideIn {
          from { opacity: 0; transform: translateY(-16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <header style={{ background: `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`, padding: "0 24px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 20px rgba(0,89,159,0.3)" }}>
        <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center" }}>
          <img src="/logo-white.svg?v=2" alt="Colbisnes" height={44} style={{ height: 44, width: "auto", display: "block" }} />
          <style>{`@keyframes msgBadgePulse { 0%,100% { transform:scale(1); } 50% { transform:scale(1.2); } }`}</style>
        </Link>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {isAuthenticated && session?.user ? (
            <>
              <button onClick={() => setShowPublishForm(!showPublishForm)} style={{ padding: "7px 16px", borderRadius: 20, background: showPublishForm ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.15)", border: "1.5px solid rgba(255,255,255,0.4)", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                {showPublishForm ? "✕ Cerrar" : "+ Publicar"}
              </button>
              <Link href={`/user/${session.user.id}`} style={{ color: "rgba(255,255,255,0.9)", textDecoration: "none", display: "flex", alignItems: "center", gap: 7, padding: "6px 12px", borderRadius: 20, background: "rgba(255,255,255,0.12)", fontSize: 13, fontWeight: 600 }}>
                <span style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, border: "1.5px solid rgba(255,255,255,0.4)", overflow: "hidden" }}>
                  {(session.user as any)?.image ? (
                    <img src={(session.user as any).image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (session.user?.name || session.user?.email || "U")[0].toUpperCase()}
                </span>
              </Link>
              <Link href="/mensajes" style={{ position:"relative", padding: "7px 14px", borderRadius: 20, border: "1.5px solid rgba(255,255,255,0.35)", background: "transparent", color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: 600, textDecoration: "none", display:"inline-flex", alignItems:"center", gap:6 }}>
                Mensajes
                {unreadTotal > 0 && (
                  <span style={{ background:"#e53e3e", color:"white", borderRadius:"50%", minWidth:18, height:18, fontSize:"0.65rem", fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 3px", boxShadow:"0 2px 6px rgba(229,62,62,0.6)", animation:"msgBadgePulse 1.5s ease-in-out infinite" }}>
                    {unreadTotal > 99 ? "99+" : unreadTotal}
                  </span>
                )}
              </Link><button onClick={() => signOut()} style={{ padding: "7px 14px", borderRadius: 20, border: "1.5px solid rgba(255,255,255,0.35)", background: "transparent", color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Salir</button>
            </>
          ) : (
            <>
              <Link href="/auth/login" style={{ color: "rgba(255,255,255,0.9)", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>Entrar</Link>
              <Link href="/auth/register" style={{ padding: "7px 16px", borderRadius: 20, background: "rgba(255,255,255,0.2)", color: "white", textDecoration: "none", fontSize: 13, fontWeight: 700, border: "1.5px solid rgba(255,255,255,0.4)" }}>Registrarse</Link>
            </>
          )}
        </div>
      </header>

      {/* Banner KYC pendiente */}
      {isAuthenticated && kycPendiente && (
        <div style={{
          background: `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary} 52%,${THEME.primaryDark})`,
          padding: "12px 20px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            
            <span style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>
              Verifica tu identidad para comprar y vender en Colbisnes
            </span>
          </div>
          <a
            href="/kyc"
            style={{
              padding: "8px 20px", borderRadius: 20, background: "#fff", color: THEME.primary,
              fontWeight: 800, fontSize: 13, textDecoration: "none", flexShrink: 0,
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            }}
          >
            Verificarme ahora →
          </a>
        </div>
      )}

      <main style={{ maxWidth: 1160, margin: "auto", padding: "28px 16px 60px" }}>
        {isAuthenticated && showPublishForm && (
          <div ref={publishFormRef} style={{ background: THEME.surfaceGradient, borderRadius: 20, padding: "24px 20px", border: "1.5px solid transparent", marginBottom: 24, boxShadow: THEME.cardShadow, scrollMarginTop: 80 }}>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: THEME.text, margin: "0 0 18px", textAlign: "center" }}>Publicar producto</h2>
            <form onSubmit={handleSubmit(onPublish)}>
              <div style={{ display: "grid", gap: 12 }}>
                <Input
                  placeholder="Título del producto *"
                  spellCheck
                  lang="es"
                  {...register("title")}
                  onKeyDown={e => {
                    // Permite: letras, tildes, ñ, espacios, guiones, paréntesis, puntos, comas y teclas de control
                    const ctrl = e.ctrlKey || e.metaKey;
                    const nav = ["Backspace","Delete","ArrowLeft","ArrowRight","Tab","Home","End"].includes(e.key);
                    if (ctrl || nav) return;
                    if (e.key.length === 1 && !/^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ\s\-',.()0-9]/.test(e.key)) e.preventDefault();
                  }}
                />
                {errors.title && <p style={{ color: "red", fontSize: 12, margin: "-8px 0 0" }}>{errors.title.message}</p>}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <Input
                      placeholder="Precio COP *"
                      type="text"
                      inputMode="numeric"
                      value={precioDisplay}
                      onChange={e => {
                        const raw = e.target.value.replace(/\./g, "").replace(/,/g, "");
                        const num = parseInt(raw) || 0;
                        setPrecioDisplay(num > 0 ? num.toLocaleString("es-CO") : "");
                        // Actualiza react-hook-form con el valor numérico
                        const syntheticEvent = { target: { value: num, name: "priceCOP" } };
                        register("priceCOP").onChange(syntheticEvent as any);
                      }}
                      onKeyDown={e => {
                        const nav = ["Backspace","Delete","ArrowLeft","ArrowRight","Tab","Home","End"].includes(e.key);
                        if (nav) return;
                        if (e.key.length === 1 && !/[0-9]/.test(e.key)) e.preventDefault();
                      }}
                    />
                    {errors.priceCOP && <p style={{ color: "red", fontSize: 12, margin: "4px 0 0" }}>{errors.priceCOP.message}</p>}
                  </div>
                  <Select {...register("city")}>{CITIES.map(c => <option key={c} value={c}>{c}</option>)}</Select>
                  <Select {...register("category")}>{CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}</Select>
                  <Select {...register("condition")}><option value="NUEVO">Nuevo</option><option value="USADO">Usado</option></Select>
                </div>
                <TextArea
                  placeholder="Descripción detallada *"
                  rows={3}
                  spellCheck
                  lang="es"
                  {...register("description")}
                />
                {errors.description && <p style={{ color: "red", fontSize: 12, margin: "-8px 0 0" }}>{errors.description.message}</p>}
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 8px" }}>Fotos del producto (max 5)</p>
                  <ImagePicker files={imageFiles} previews={imagePreviews} onChange={(f,p) => { setImageFiles(f); setImagePreviews(p); }} disabled={uploadingImages} />
                  {bluAnalizando && (
                    <p style={{ fontSize: 12, color: THEME.muted, margin: "8px 0 0", display: "flex", alignItems: "center", gap: 6 }}>
                      <img src="/chucho-avatar.png" alt="" style={{ width: 16, height: 16, borderRadius: "50%" }} />
                      Chucho Bot está mirando la foto…
                    </p>
                  )}
                  {bluError && !bluAnalizando && (
                    <p style={{ fontSize: 12, color: THEME.muted, margin: "8px 0 0", display: "flex", alignItems: "center", gap: 6 }}>
                      <img src="/chucho-avatar.png" alt="" style={{ width: 16, height: 16, borderRadius: "50%", opacity: 0.6 }} />
                      {bluError}
                    </p>
                  )}
                  {bluSugerencia && (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap", marginTop: 8, padding: "10px 14px", borderRadius: 12, background: THEME.surfaceAlt, border: `1.5px solid ${THEME.border}`, fontFamily: "inherit" }}>
                      <img src="/chucho-avatar.png" alt="Chucho Bot" style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, marginTop: 2 }} />
                      <div style={{ flex: 1, minWidth: 140, fontFamily: "inherit" }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: THEME.primaryDark, lineHeight: 1.4, letterSpacing: "normal" }}>
                          {bluSugerencia.tituloSugerido}
                        </p>
                        {bluSugerencia.descripcionSugerida && (
                          <p style={{ margin: "3px 0 0", fontSize: 12.5, fontWeight: 400, color: THEME.textSoft, lineHeight: 1.45, letterSpacing: "normal" }}>
                            {bluSugerencia.descripcionSugerida}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setValue("title", bluSugerencia.tituloSugerido, { shouldValidate: true, shouldDirty: true });
                          if (bluSugerencia.descripcionSugerida) setValue("description", bluSugerencia.descripcionSugerida, { shouldValidate: true, shouldDirty: true });
                          if (bluSugerencia.categoriaSugerida) setValue("category", bluSugerencia.categoriaSugerida, { shouldValidate: true, shouldDirty: true });
                          if (bluSugerencia.condicionSugerida) setValue("condition", bluSugerencia.condicionSugerida, { shouldValidate: true, shouldDirty: true });
                          setBluSugerencia(null);
                        }}
                        style={{ border: "none", borderRadius: 10, padding: "6px 12px", fontSize: 11.5, fontFamily: "inherit", fontWeight: 700, cursor: "pointer", background: `linear-gradient(135deg,${THEME.primaryLight},${THEME.primary})`, color: "#fff", flexShrink: 0 }}
                      >
                        Usar sugerencia
                      </button>
                      <button
                        type="button"
                        onClick={() => setBluSugerencia(null)}
                        aria-label="Descartar sugerencia de Chucho Bot"
                        style={{ border: "none", background: "transparent", color: THEME.muted, fontSize: 15, fontFamily: "inherit", cursor: "pointer", fontWeight: 900, padding: "0 4px", flexShrink: 0 }}
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                <Button type="submit" disabled={isSubmitting || uploadingImages}>{uploadingImages ? "Subiendo..." : isSubmitting ? "Publicando..." : "Publicar"}</Button>
                <OutlineButton type="button" onClick={() => { reset(); setImageFiles([]); setImagePreviews([]); setShowPublishForm(false); setPrecioDisplay(""); }}>Cancelar</OutlineButton>
              </div>
            </form>
          </div>
        )}
        <div style={{ background: THEME.surfaceGradient, borderRadius: 16, padding: "14px 16px", border: "1.5px solid transparent", marginBottom: 20, boxShadow: THEME.cardShadow }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Input placeholder="Buscar productos..." value={filters.searchQuery} onChange={e => setFilters(prev => ({ ...prev, searchQuery: e.target.value }))} style={{ flex: 1, minWidth: 180 }} />
          </div>
          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8, marginTop: 4 }}>
            {CATEGORIES.map(c => {
              const activa = (filters as any).category === c.id;
              return (
                <button key={c.id} onClick={() => setFilters(prev => ({ ...prev, category: activa ? "" : c.id } as any))}
                  style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "8px 14px", borderRadius: 16, border: activa ? "2px solid #1466cc" : "1px solid " + THEME.border, background: activa ? "rgba(20,102,204,0.12)" : "#f4f7fb", cursor: "pointer", minWidth: 72 }}>
                  <span style={{ fontSize: 22 }}>{c.icon}</span>
                  <span style={{ fontSize: 11, fontWeight: activa ? 800 : 600, color: activa ? THEME.primary : THEME.muted, whiteSpace: "nowrap" }}>{c.label}</span>
                </button>
              );
            })}
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
        <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: THEME.text, margin: 0, width: "100%", textAlign: "center" }}>Productos</h2>
          <span style={{ background: THEME.surfaceAlt, padding: "5px 14px", borderRadius: 20, fontSize: 13, color: THEME.textSoft, position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)" }}>{productsCount} encontrado{productsCount !== 1 ? "s" : ""}</span>
        </div>
        {error && <div style={{ padding: 20, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 12, color: "#fca5a5", marginBottom: 16 }}>⚠️ {error}</div>}
        {loading && productsCount === 0 ? (
          <SkeletonGrid count={6} />
        ) : (
          <InfiniteScroll dataLength={productsCount} next={fetchMore} hasMore={hasMore} loader={<SkeletonGrid count={2} />} endMessage={productsCount > 0 ? <p style={{ textAlign: "center", padding: 20, color: THEME.muted }}>No hay mas productos</p> : null}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 20 }}>
              {products.map(product => (
                <ProductCard key={product.id} product={product} onSelect={setSelectedProductId} onPaymentRequest={handlePaymentRequest} onConfirmDelivery={handleConfirmDelivery} onReviewClick={setReviewingProduct} isSelected={selectedProductId === product.id} isOwner={session?.user?.id === product.seller?.id} currentUserId={session?.user?.id || null} pendingOffersCount={product._count?.offers || 0} mensajesNoLeidos={unreadByProduct[product.id] || 0} />
              ))}
            </div>
          </InfiniteScroll>
        )}
        {!loading && productsCount === 0 && !error && (
          <div style={{ textAlign: "center", padding: 60, background: THEME.surface, borderRadius: 20, border: `2px dashed ${THEME.border}`, boxShadow: THEME.cardShadow }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>🔍</div>
            <p style={{ fontSize: 16, color: THEME.muted, margin: "0 0 16px" }}>No se encontraron productos</p>
            {hasActiveFilters && <OutlineButton onClick={clearFilters}>Limpiar filtros</OutlineButton>}
          </div>
        )}
      </main>
      <footer style={{ borderTop: `1px solid ${THEME.border}`, background: THEME.surface, padding: "32px 24px" }}>
        <div style={{ maxWidth: 1160, margin: "auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <img src="/logo.svg?v=2" alt="Colbisnes" style={{ height: 30, width: "auto", display: "block" }} />
            </div>
            <p style={{ fontSize: 12, color: THEME.muted, margin: "3px 0 0" }}>© {new Date().getFullYear()} Colbisnes — La mejor tienda de segunda mano de Colombia</p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {PAYMENT_METHODS.map(m => (
              <span key={m.label} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px 5px 6px", borderRadius: 20, background: "#f4f7fb", border: `1px solid ${THEME.border}`, color: THEME.text, fontSize: 12, fontWeight: 700, boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }}>
                <img src={m.logo} alt={m.label} style={{ height: 24, width: 24, objectFit: "contain", borderRadius: 6, display: "block", background: "#fff", padding: 2 }} />
                {m.label}
              </span>
            ))}
          </div>
        </div>
      </footer>
      {selectedProductId && <OfferModal productId={selectedProductId} products={products} offers={filtrarOfertasVisibles(offers, products.find((p:any) => p.id === selectedProductId))} loading={loadingOffers || isSubmittingOffer} session={session} onClose={() => setSelectedProductId(null)} onCreateOffer={handleMakeOffer} onUpdateOffer={handleUpdateOffer} />}
      {reviewingProduct && <ReviewModal product={reviewingProduct} session={session} onClose={() => setReviewingProduct(null)} onSubmitReview={handleSubmitReview} />}
      {trackingOrderId && (
        <TrackingOverlay
          orderId={trackingOrderId}
          productTitle="Tu compra en Colbisnes"
          onClose={() => setTrackingOrderId(null)}
        />
      )}
      {paymentModalProduct && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 20, backdropFilter: "blur(4px)" }} onClick={e => e.target === e.currentTarget && setPaymentModalProduct(null)}>
          <div style={{ background: THEME.surfaceGradient, borderRadius: 24, padding: "28px 24px", maxWidth: 460, width: "100%", border: "1.5px solid transparent", boxShadow: "0 24px 80px rgba(0,20,45,0.28)" }}>
            <h3 style={{ margin: "0 0 16px", color: THEME.text, fontSize: 18, fontWeight: 800, textAlign: "center" }}>Realizar pago</h3>
            <div style={{ padding: "14px 16px", background: THEME.surfaceAlt, borderRadius: 12, marginBottom: 16 }}>
              <p style={{ margin: "0 0 4px", fontWeight: 700, color: THEME.text }}>{paymentModalProduct.title}</p>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 900, color: THEME.gold }}>{formatMoney(paymentModalProduct.priceCOP)}</p>
            </div>
            <div style={{ padding: "14px 16px", background: THEME.surfaceAlt, borderRadius: 12, marginBottom: 20 }}>
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
