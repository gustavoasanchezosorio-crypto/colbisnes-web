'use client';

import React, { useState, useCallback } from 'react';
import { Button, OutlineButton, Input } from './FormComponents';
import { THEME } from '@/lib/theme';

interface ReviewModalProps {
  product: any;
  session: any;
  onClose: () => void;
  onSubmitReview: (productId: string, rating: number, comment: string) => Promise<void>;
}

export const ReviewModal: React.FC<ReviewModalProps> = ({
  product,
  session,
  onClose,
  onSubmitReview,
}) => {
  const [rating, setRating] = useState<number>(5);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!product || !session) return null;

  const handleSubmit = useCallback(async () => {
    if (rating < 1 || rating > 5) {
      alert('La calificación debe ser entre 1 y 5');
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmitReview(product.id, rating, comment);
      onClose();
    } catch (error) {
      // error ya manejado
    } finally {
      setIsSubmitting(false);
    }
  }, [product.id, rating, comment, onSubmitReview, onClose]);

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
        width: 400,
      }}>
        <h2 style={{ fontSize: "1.5rem", marginBottom: 20, color: THEME.primary }}>Calificar transacción</h2>
        <p style={{ marginBottom: 16 }}>Producto: <strong>{product.title}</strong></p>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", marginBottom: 8, fontSize: "0.9rem", fontWeight: 500 }}>Puntuación (1-5)</label>
          <select
            value={rating}
            onChange={(e) => setRating(Number(e.target.value))}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 12,
              border: `1px solid ${THEME.border}`,
              fontSize: "0.95rem",
            }}
            disabled={isSubmitting}
          >
            {[1, 2, 3, 4, 5].map(r => <option key={r} value={r}>{r} ⭐</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: "block", marginBottom: 8, fontSize: "0.9rem", fontWeight: 500 }}>Comentario (opcional)</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 12,
              border: `1px solid ${THEME.border}`,
              fontSize: "0.95rem",
              resize: "vertical",
            }}
            disabled={isSubmitting}
          />
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Enviando..." : "Enviar calificación"}
          </Button>
          <OutlineButton onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </OutlineButton>
        </div>
      </div>
    </div>
  );
};
