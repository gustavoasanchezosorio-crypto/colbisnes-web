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

export const useProducts = (filters: FilterState) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(1);

  const fetchProducts = useCallback(async (loadMore = false) => {
    setLoading(true);
    setError(null);
    try {
      const currentPage = loadMore ? pageRef.current + 1 : 1;
      const params = new URLSearchParams();
      params.append('page', String(currentPage));
      params.append('limit', '10');
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });

      const res = await fetch(`/api/products?${params.toString()}`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data: Product[] = await res.json();

      setProducts(prev => {
        if (!loadMore) return data;
        const existingIds = new Set(prev.map(p => p.id));
        const newOnly = data.filter(p => !existingIds.has(p.id));
        return [...prev, ...newOnly];
      });

      setHasMore(data.length === 10);
      pageRef.current = currentPage;
      setPage(currentPage);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      fetchProducts(false);
    }, 300);
    return () => clearTimeout(debounceTimer);
  }, [filters]);

  // Polling cada 5 segundos para actualizar estados en tiempo real
  useEffect(() => {
    const intervalo = setInterval(() => {
      fetchProducts(false);
    }, 5000);
    return () => clearInterval(intervalo);
  }, [filters]);

  return { products, loading, error, hasMore, fetchMore: () => fetchProducts(true), refetch: () => fetchProducts(false) };
};
