'use client';

import React from 'react';
import { THEME } from '@/lib/theme';

export const ProductCardSkeleton: React.FC = () => (
  <div style={{
    background: THEME.surfaceGradient,
    borderRadius: 20,
    padding: 20,
    border: "1.5px solid transparent",
    boxShadow: THEME.cardShadow,
    animation: "pulse 1.5s infinite",
  }}>
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <div style={{ flex: 1 }}>
        <div style={{ height: 24, background: "rgba(0,0,0,0.08)", borderRadius: 4, width: "75%", marginBottom: 8 }} />
        <div style={{ height: 16, background: "rgba(0,0,0,0.08)", borderRadius: 4, width: "50%", marginBottom: 12 }} />
        <div style={{ height: 64, background: "rgba(0,0,0,0.08)", borderRadius: 4, width: "100%", marginBottom: 12 }} />
        <div style={{ height: 16, background: "rgba(0,0,0,0.08)", borderRadius: 4, width: "33%" }} />
      </div>
      <div style={{ height: 32, background: "rgba(0,0,0,0.08)", borderRadius: 4, width: 96, marginLeft: 16 }} />
    </div>
  </div>
);

export const SkeletonGrid: React.FC<{ count?: number }> = ({ count = 6 }) => (
  <div style={{
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
    gap: 24,
  }}>
    {Array.from({ length: count }).map((_, i) => (
      <ProductCardSkeleton key={i} />
    ))}
  </div>
);
