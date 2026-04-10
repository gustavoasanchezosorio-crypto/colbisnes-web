'use client';

import { useEffect, useState } from 'react';
import { Button } from './FormComponents';
import { THEME } from '@/lib/theme';

declare global {
  interface Window {
    ePayco?: any;
  }
}

interface EpaycoCheckoutProps {
  sessionId: string;
  onClose?: () => void;
}

export function EpaycoCheckout({ sessionId, onClose }: EpaycoCheckoutProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    const script = document.createElement('script');
    script.src = 'https://checkout.epayco.co/checkout.js';
    script.onload = () => {
      setIsLoading(false);
      if (window.ePayco) {
        try {
          window.ePayco.checkout.configure({
            key: process.env.NEXT_PUBLIC_EPAYCO_PUBLIC_KEY,
            test: process.env.EPAYCO_ENV === 'test',
          });
          window.ePayco.checkout.open(sessionId);
        } catch (err) {
          console.error(err);
          setError("Error al iniciar el checkout");
        }
      } else {
        setError("No se pudo cargar la librería de Epayco");
      }
    };
    script.onerror = () => {
      setIsLoading(false);
      setError("Error al cargar la librería de Epayco");
    };
    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, [sessionId]);

  if (error) {
    return <div style={{ color: THEME.error }}>❌ {error}</div>;
  }

  if (isLoading) {
    return <div>Cargando pasarela de pago...</div>;
  }

  return (
    <div style={{ textAlign: 'center', marginTop: '2rem' }}>
      <Button onClick={onClose}>Cerrar</Button>
    </div>
  );
}
