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
  const [hoverRating, setHoverRating] = useState<number>(0);
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
        background: THEME.surfaceGradient,
        borderRadius: 20,
        width: 400,
        border: `1px solid ${THEME.border}`,
        boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
        overflow: "hidden",
      }}>
        <div style={{
          background: "linear-gradient(135deg,#5ccbf2 0%,#1466cc 55%,#0a2e6b 100%)",
          padding: "24px 30px",
          textAlign: "center",
        }}>
          <div style={{ fontSize: "2rem", marginBottom: 6 }}>🤝</div>
          <h2 style={{ fontSize: "1.4rem", margin: 0, color: "#fff", fontWeight: 700 }}>Calificar transacción</h2>
          <p style={{ margin: "6px 0 0", color: "rgba(255,255,255,0.85)", fontSize: "0.85rem" }}>
            Producto: <strong style={{ color: "#fff" }}>{product.title}</strong>
          </p>
        </div>
        <div style={{ padding: 30 }}>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", marginBottom: 10, fontSize: "0.9rem", fontWeight: 500, color: THEME.textSoft, textAlign: "center" }}>¿Cómo calificarías esta transacción?</label>
          <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>
            {[1, 2, 3, 4, 5].map(r => (
              <button
                key={r}
                type="button"
                onClick={() => setRating(r)}
                onMouseEnter={() => setHoverRating(r)}
                onMouseLeave={() => setHoverRating(0)}
                disabled={isSubmitting}
                style={{
                  background: "none",
                  border: "none",
                  cursor: isSubmitting ? "default" : "pointer",
                  fontSize: "2rem",
                  lineHeight: 1,
                  padding: 2,
                  filter: r <= (hoverRating || rating) ? "none" : "grayscale(100%) opacity(0.4)",
                  transform: r <= (hoverRating || rating) ? "scale(1.1)" : "scale(1)",
                  transition: "transform 0.1s, filter 0.1s",
                }}
                aria-label={`${r} estrellas`}
              >
                ⭐
              </button>
            ))}
          </div>
          <p style={{ textAlign: "center", marginTop: 8, color: THEME.gold, fontWeight: 600, fontSize: "0.95rem" }}>{rating} / 5</p>
        </div>
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: "block", marginBottom: 8, fontSize: "0.9rem", fontWeight: 500, color: THEME.textSoft }}>Comentario (opcional)</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 12,
              border: `1px solid ${THEME.border}`,
              background: THEME.surfaceAlt,
              color: THEME.text,
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
    </div>
  );
};
