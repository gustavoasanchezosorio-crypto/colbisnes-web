'use client';

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';

type NotificationContextType = {
  unreadTotal: number;
  // Contador que aumenta cada vez que se detecta y notifica un mensaje nuevo.
  // Cualquier componente puede observarlo (useEffect) para disparar su propio
  // efecto visual, sin depender de dónde vive el poll real.
  nudgeTick: number;
};

const NotificationContext = createContext<NotificationContextType>({ unreadTotal: 0, nudgeTick: 0 });

const POLL_MS = 2500;

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [nudgeTick, setNudgeTick] = useState(0);
  // Última fecha de creación de mensaje que ya vimos/notificamos (ISO string, comparable lexicográficamente).
  const lastSeenAtRef = useRef<string | null>(null);
  const firstLoadRef = useRef(true);

  const fireNudge = useCallback(() => {
    try {
      const audio = new Audio('/sounds/mensaje-nuevo.mp3');
      audio.volume = 0.9;
      audio.play().catch((err) => {
        // Antes este error se tragaba en silencio (.catch(() => {})), lo que hacía
        // imposible distinguir un bloqueo de autoplay del navegador de otros fallos.
        console.warn('[notificaciones] No se pudo reproducir el sonido (posible bloqueo de autoplay):', err);
      });
    } catch (err) {
      console.warn('[notificaciones] Error creando el audio de notificación:', err);
    }
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate([160, 60, 160, 60, 260]); } catch {}
    }
    setNudgeTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;

    const fetchUnread = () => {
      fetch('/api/messages/unread')
        .then((r) => r.json())
        .then((d) => {
          if (cancelled) return;
          if (typeof d.count === 'number') setUnreadTotal(d.count);

          if (d.latestAt) {
            const isNew = !lastSeenAtRef.current || d.latestAt > lastSeenAtRef.current;
            if (isNew) {
              // No sonar en la primera carga (sería un mensaje viejo, no uno nuevo).
              if (!firstLoadRef.current) fireNudge();
              lastSeenAtRef.current = d.latestAt;
            }
          }
          firstLoadRef.current = false;
        })
        .catch(() => {});
    };

    fetchUnread();
    const iv = setInterval(fetchUnread, POLL_MS);
    return () => { cancelled = true; clearInterval(iv); };
  }, [status, fireNudge]);

  // Al cerrar sesión, reiniciar el estado para que no queden restos de la sesión anterior.
  useEffect(() => {
    if (status !== 'authenticated') {
      setUnreadTotal(0);
      lastSeenAtRef.current = null;
      firstLoadRef.current = true;
    }
  }, [status]);

  return (
    <NotificationContext.Provider value={{ unreadTotal, nudgeTick }}>
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationContext);
