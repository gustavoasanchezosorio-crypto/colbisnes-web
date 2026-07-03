import { useState, useEffect, useCallback, useRef } from 'react';

export interface FilterState {
  searchQuery: string;
  city: string;
  minPrice: string;
  maxPrice: string;
  status: string;
}

export interface Product {
  id: string;
  title: string;
  description: string;
  priceCOP: number;
  city: string;
  status?: string;
  createdAt: string;
  acceptedOfferId?: string | null;
  paymentExpiresAt?: string | number | null;
  paidAt?: string | null;
  soldAt?: string | null;
  seller?: {
    id: string;
    name: string | null;
    avgRating?: number;
    totalReviews?: number;
    kycStatus?: string;
  };
  _count?: { offers: number };
}

const LIMIT = 10;
const MAX_LOADED = 200;

export const useProducts = (filters: FilterState) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const pageRef = useRef(1);
  const inFlight = useRef(false);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const buildQuery = useCallback((page: number, limit: number) => {
    const f = filtersRef.current;
    const params = new URLSearchParams();
    params.append('page', String(page));
    params.append('limit', String(limit));
    if (f.searchQuery) params.append('q', f.searchQuery);
    if (f.city) params.append('city', f.city);
    if (f.minPrice) params.append('minPrice', f.minPrice);
    if (f.maxPrice) params.append('maxPrice', f.maxPrice);
    if (f.status) params.append('status', f.status);
    return params.toString();
  }, []);

  // Carga inicial / recarga por cambio de filtros (muestra skeleton)
  const loadFirst = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/products?${buildQuery(1, LIMIT)}`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data: Product[] = await res.json();
      setProducts(data);
      setHasMore(data.length === LIMIT);
      pageRef.current = 1;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  // Cargar la siguiente pagina (scroll infinito): agrega al final
  const fetchMore = useCallback(async () => {
    if (inFlight.current || !hasMore) return;
    inFlight.current = true;
    setLoadingMore(true);
    try {
      const next = pageRef.current + 1;
      if (next * LIMIT > MAX_LOADED) { setHasMore(false); return; }
      const res = await fetch(`/api/products?${buildQuery(next, LIMIT)}`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data: Product[] = await res.json();
      let added = 0;
      setProducts(prev => {
        const ids = new Set(prev.map(p => p.id));
        const newOnly = data.filter(p => !ids.has(p.id));
        added = newOnly.length;
        return added ? [...prev, ...newOnly] : prev;
      });
      pageRef.current = next;
      // Solo seguimos si vino una pagina completa Y hubo elementos nuevos
      setHasMore(data.length === LIMIT && added > 0);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
      inFlight.current = false;
    }
  }, [buildQuery, hasMore]);

  // Refresco silencioso de la ventana ya cargada: sin skeleton, sin resetear paginacion.
  // Mantiene estados en tiempo real (vendido, en custodia, etc.) sin romper el scroll infinito.
  const refreshInPlace = useCallback(async () => {
    if (inFlight.current) return;
    try {
      const count = Math.min(MAX_LOADED, Math.max(pageRef.current * LIMIT, LIMIT));
      const res = await fetch(`/api/products?${buildQuery(1, count)}`);
      if (!res.ok) return;
      const data: Product[] = await res.json();
      setProducts(data);
      setHasMore(data.length === count && count < MAX_LOADED);
    } catch {
      /* silencioso: no rompemos la vista por un fallo de red puntual */
    }
  }, [buildQuery]);

  // Recargar al cambiar filtros (con debounce)
  useEffect(() => {
    const t = setTimeout(() => { pageRef.current = 1; loadFirst(); }, 300);
    return () => clearTimeout(t);
  }, [filters, loadFirst]);

  // Polling cada 5s para reflejar cambios de estado en tiempo real (silencioso)
  useEffect(() => {
    const id = setInterval(() => { refreshInPlace(); }, 5000);
    return () => clearInterval(id);
  }, [refreshInPlace]);

  return { products, loading, loadingMore, error, hasMore, fetchMore, refetch: refreshInPlace };
};
