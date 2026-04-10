'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Button, OutlineButton, Input } from './FormComponents';
import { THEME } from '@/lib/theme';
import { formatMoney, getOfferStatusLabel, getOfferStatusColor } from '@/lib/utils';

interface OfferModalProps {
  productId: string;
  products: any[];
  offers: any[];
  loading: boolean;
  session: any;
  onClose: () => void;
  onCreateOffer: (productId: string, amount: number, message: string) => Promise<void>;
  onUpdateOffer: (offerId: string, status: string) => Promise<void>;
}

export const OfferModal: React.FC<OfferModalProps> = ({
  productId,
  products,
  offers,
  loading,
  session,
  onClose,
  onCreateOffer,
  onUpdateOffer,
}) => {
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState('');

  const product = useMemo(() => products.find(p => p.id === productId), [products, productId]);
  const isOwner = session?.user?.id === product?.seller?.id;

  const handleSubmit = useCallback(async () => {
    setValidationError('');
    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      setValidationError('Monto inválido');
      return;
    }
    if (product && numAmount > product.priceCOP) {
      setValidationError('El precio no puede ser superior al publicado por el vendedor');
      return;
    }
    setIsSubmitting(true);
    try {
      await onCreateOffer(productId, numAmount, message);
      setAmount('');
      setMessage('');
    } finally {
      setIsSubmitting(false);
    }
  }, [amount, message, productId, product, onCreateOffer]);

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.5)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
      padding: 20,
    }}>
      <div style={{
        background: "white",
        padding: 30,
        borderRadius: 20,
        width: 500,
        maxHeight: "80vh",
        overflowY: "auto",
      }}>
        <h2 style={{ fontSize: "1.5rem", marginBottom: 20, color: THEME.primary }}>Ofertas</h2>

        {session && !isOwner && (
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: "1rem", marginBottom: 10 }}>Nueva oferta</h3>
            <Input
              placeholder="Monto COP"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={isSubmitting}
            />
            {validationError && <p style={{ color: THEME.error, fontSize: "0.8rem", marginTop: 4 }}>{validationError}</p>}
            <Input
              placeholder="Mensaje (opcional)"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              style={{ marginTop: 8 }}
              disabled={isSubmitting}
            />
            <Button onClick={handleSubmit} style={{ marginTop: 12 }} disabled={isSubmitting}>
              {isSubmitting ? 'Enviando...' : 'Enviar oferta'}
            </Button>
          </div>
        )}

        {loading ? (
          <p style={{ textAlign: "center", padding: 16 }}>Cargando ofertas...</p>
        ) : offers.length === 0 ? (
          <p style={{ textAlign: "center", padding: 16, color: THEME.muted }}>No hay ofertas aún.</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {offers.map((offer) => (
              <div
                key={offer.id}
                style={{
                  padding: 16,
                  borderRadius: 12,
                  border: `1px solid ${THEME.border}`,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, color: THEME.primary }}>{formatMoney(offer.amountCOP)}</span>
                  <span style={{
                    padding: "4px 12px",
                    borderRadius: 20,
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    background: getOfferStatusColor(offer.status),
                    color: offer.status === 'PENDING' ? THEME.text : 'white',
                  }}>
                    {getOfferStatusLabel(offer.status)}
                  </span>
                </div>
                {offer.message && <p style={{ fontSize: "0.9rem", marginBottom: 8, color: THEME.muted }}>{offer.message}</p>}
                {offer.user && <p style={{ fontSize: "0.8rem", color: THEME.primary }}>Ofertante: {offer.user.name || 'Anónimo'}</p>}
                {isOwner && offer.status === 'PENDING' && (
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <Button onClick={() => onUpdateOffer(offer.id, 'ACCEPTED')}>Aceptar</Button>
                    <OutlineButton onClick={() => onUpdateOffer(offer.id, 'REJECTED')}>Rechazar</OutlineButton>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <OutlineButton onClick={onClose} style={{ width: "100%", marginTop: 20 }}>
          Cerrar
        </OutlineButton>
      </div>
    </div>
  );
};
