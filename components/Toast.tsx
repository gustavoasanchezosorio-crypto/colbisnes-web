'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { THEME } from '@/lib/theme';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        zIndex: 9999,
      }}>
        {toasts.map(toast => (
          <div
            key={toast.id}
            style={{
              padding: 12,
              borderRadius: 10,
              boxShadow: "0 8px 22px rgba(0,0,0,0.18)",
              border: `1px solid ${THEME.goldSoft}`,
              background: toast.type === 'success' ? THEME.success :
                          toast.type === 'error' ? THEME.error :
                          toast.type === 'warning' ? THEME.warning : THEME.primary,
              color: "white",
              minWidth: 200,
              textAlign: "center",
              animation: "slideIn 0.3s",
            }}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
};
