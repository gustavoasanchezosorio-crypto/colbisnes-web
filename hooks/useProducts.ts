import { useState, useEffect, useCallback } from 'react';

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

  const fetchProducts = useCallback(async (loadMore = false) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (loadMore) params.append('page', String(page + 1));
      else params.append('page', '1');
      params.append('limit', '10');
      
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });

      const res = await fetch(`/api/products?${params.toString()}`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      
      setProducts(prev => loadMore ? [...prev, ...data] : data);
      setHasMore(data.length === 10);
      if (loadMore) setPage(p => p + 1);
      else setPage(1);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      fetchProducts(false);
    }, 300);
    return () => clearTimeout(debounceTimer);
  }, [fetchProducts]);

  return { products, loading, error, hasMore, fetchMore: () => fetchProducts(true), refetch: () => fetchProducts(false) };
};
