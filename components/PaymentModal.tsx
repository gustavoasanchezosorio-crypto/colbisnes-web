'use client';

import React, { useState } from 'react';
import { Button, OutlineButton } from './FormComponents';
import { THEME } from '@/lib/theme';

interface PaymentModalProps {
  seller: {
    name: string | null;
    nequiPhone: string | null;
    brebId: string | null;
  };
  productTitle: string;
  amount: number;
  onClose: () => void;
  onConfirmPayment: () => Promise<void>;
}

export function PaymentModal({ seller, productTitle, amount, onClose, onConfirmPayment }: PaymentModalProps) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirmPayment();
      onClose();
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
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
      zIndex: 2000,
      padding: 20,
    }}>
      <div style={{
        background: THEME.surfaceGradient,
        borderRadius: 20,
        padding: "2rem",
        maxWidth: 500,
        width: "100%",
        textAlign: "center",
        border: `1px solid ${THEME.border}`,
        boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
      }}>
        <h2 style={{ color: THEME.text, marginBottom: "1rem" }}>Pagar con Nequi o Bre-B</h2>
        <p><strong>Producto:</strong> {productTitle}</p>
        <p><strong>Monto:</strong> ${amount.toLocaleString('es-CO')}</p>
        <p><strong>Vendedor:</strong> {seller.name || "Anónimo"}</p>
        <hr style={{ margin: "1rem 0", borderColor: THEME.border }} />
        <h3 style={{ color: THEME.gold }}>Datos para el pago</h3>
        {seller.nequiPhone && (
          <p><strong>Nequi:</strong> {seller.nequiPhone}</p>
        )}
        {seller.brebId && (
          <p><strong>Bre-B:</strong> {seller.brebId}</p>
        )}
        {(!seller.nequiPhone && !seller.brebId) && (
          <p style={{ color: THEME.error }}>El vendedor no ha configurado sus datos de pago. Contacta con él por el chat.</p>
        )}
        <div style={{ marginTop: "2rem", display: "flex", gap: "1rem", justifyContent: "center" }}>
          <Button onClick={handleConfirm} disabled={loading}>
            {loading ? "Procesando..." : "Ya realicé el pago"}
          </Button>
          <OutlineButton onClick={onClose}>Cancelar</OutlineButton>
        </div>
        <p style={{ fontSize: "0.8rem", marginTop: "1rem", color: THEME.muted }}>
          Al hacer clic en "Ya realicé el pago", confirmas que transferiste el dinero al vendedor. El producto quedará en custodia hasta que el vendedor confirme la entrega.
        </p>
      </div>
    </div>
  );
}
