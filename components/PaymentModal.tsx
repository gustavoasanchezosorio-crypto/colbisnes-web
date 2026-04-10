'use client';

import React, { useState } from 'react';
import { Button, OutlineButton } from './FormComponents';
import { THEME } from '@/lib/theme';
import { formatMoney } from '@/lib/utils';

interface PaymentModalProps {
  product: any;
  onClose: () => void;
  onConfirm: (productId: string) => Promise<void>;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  product,
  onClose,
  onConfirm,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm(product.id);
      onClose();
    } catch (error) {
      // error already handled in parent
    } finally {
      setIsSubmitting(false);
    }
  };

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
        <h2 style={{ fontSize: "1.5rem", marginBottom: 20, color: THEME.primary }}>
          Confirmar pago
        </h2>
        <p>Producto: <strong>{product.title}</strong></p>
        <p>Precio: <strong>{formatMoney(product.priceCOP)}</strong></p>
        <p>¿Deseas proceder con el pago simulado?</p>
        <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
          <Button onClick={handleConfirm} disabled={isSubmitting}>
            {isSubmitting ? "Procesando..." : "Pagar"}
          </Button>
          <OutlineButton onClick={onClose}>Cancelar</OutlineButton>
        </div>
      </div>
    </div>
  );
};
