'use client';

import React, { useCallback } from 'react';
import Link from 'next/link';
import { Button, OutlineButton } from './FormComponents';
import { THEME } from '@/lib/theme';
import { formatMoney, getTimeLeft, getStatusLabel } from '@/lib/utils';
import { Product } from '@/hooks/useProducts';

interface ProductCardProps {
  product: Product;
  onSelect: (id: string) => void;
  onEpaycoPayment: (productId: string) => Promise<void>;
  onConfirmDelivery: (id: string) => Promise<void>;
  onReviewClick: (product: Product) => void;
  isSelected: boolean;
  isOwner: boolean;
  pendingOffersCount: number;
}

export const ProductCard = React.memo(function ProductCard({
  product,
  onSelect,
  onEpaycoPayment,
  onConfirmDelivery,
  onReviewClick,
  isSelected,
  isOwner,
  pendingOffersCount,
}: ProductCardProps) {
  const timer = getTimeLeft(product.paymentExpiresAt);
  const isSold = product.status === 'SOLD';
  const status = getStatusLabel(product.status);

  const handleSelect = useCallback(() => onSelect(product.id), [product.id, onSelect]);
  const handleEpaycoPayment = useCallback(() => onEpaycoPayment(product.id), [product.id, onEpaycoPayment]);
  const handleConfirmDelivery = useCallback(() => onConfirmDelivery(product.id), [product.id, onConfirmDelivery]);
  const handleReviewClick = useCallback(() => onReviewClick(product), [product.id, onReviewClick]);

  return (
    <div
      style={{
        position: "relative",
        background: THEME.surface,
        borderRadius: 20,
        padding: "20px",
        border: `1px solid ${THEME.border}`,
        boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
        transition: "all 0.25s",
      }}
    >
      {isSold && (
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          zIndex: 10,
        }}>
          <span style={{
            color: THEME.error,
            fontSize: "2rem",
            fontWeight: 900,
            textTransform: "uppercase",
            transform: "rotate(-3deg)",
            opacity: 0.8,
            textShadow: "2px 2px 4px rgba(0,0,0,0.3)",
            border: `4px solid ${THEME.error}`,
            padding: "0.5rem 2rem",
            borderRadius: 20,
            backgroundColor: "rgba(255,255,255,0.2)",
          }}>
            VENDIDO POR COLBISNES
          </span>
        </div>
      )}

      <div style={{ position: "relative", zIndex: isSold ? 5 : 2 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: 6, color: THEME.text }}>
              {product.title}
            </h3>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
              <span style={{ fontSize: "0.9rem", color: THEME.muted }}>📍 {product.city}</span>
              <span style={{ fontSize: "0.9rem", color: THEME.muted }}>📦 {status}</span>
              {!isSold && pendingOffersCount > 0 && (
                <span style={{
                  background: THEME.secondary,
                  color: THEME.text,
                  padding: "4px 10px",
                  borderRadius: 20,
                  fontSize: "0.8rem",
                  fontWeight: 700,
                }}>
                  {pendingOffersCount} oferta{pendingOffersCount !== 1 ? "s" : ""}
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
                    color: THEME.text,
                    padding: "4px 8px",
                    borderRadius: 20,
                    fontSize: "0.7rem",
                    fontWeight: 600,
                  }}>
                    {product.seller.avgRating} ⭐ ({product.seller.totalReviews})
                  </span>
                ) : (
                  <span style={{
                    background: THEME.border,
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
          <div style={{ fontSize: "1.8rem", fontWeight: 800, color: THEME.primary, marginLeft: 16 }}>
            {formatMoney(product.priceCOP)}
          </div>
        </div>

        {product.status === 'PAYMENT_PENDING' && timer && timer !== "00:00" && (
          <div style={{
            marginTop: 16,
            padding: 12,
            background: THEME.border,
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}>
            <span style={{ fontSize: "1.2rem" }}>⏳</span>
            <span style={{ fontSize: "0.9rem" }}>
              <strong>Pago en proceso</strong> — Tiempo restante:{" "}
              <span style={{ fontWeight: 700, color: THEME.primary }}>{timer}</span>
            </span>
          </div>
        )}

        <div style={{ display: "flex", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
          {!isSold && (
            <>
              {product.status === 'PAYMENT_PENDING' && !isOwner && (
                <Button onClick={handleEpaycoPayment}>Pagar con Epayco</Button>
              )}
              {product.status === 'IN_ESCROW' && isOwner && (
                <Button onClick={handleConfirmDelivery}>Confirmar entrega</Button>
              )}
              {!isOwner ? (
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
          {isSold && (
            <OutlineButton onClick={handleReviewClick}>
              Calificar transacción
            </OutlineButton>
          )}
        </div>
      </div>
    </div>
  );
});
