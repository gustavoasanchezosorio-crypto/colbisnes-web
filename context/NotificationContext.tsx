'use client';

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { THEME } from '@/lib/theme';

type MsgPopup = { from: string | null; title: string | null; image: string | null; productId: string | null };

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
  const router = useRouter();
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [nudgeTick, setNudgeTick] = useState(0);
  // Popup de mensaje nuevo: muestra de qué producto te están escribiendo.
  const [msgPopup, setMsgPopup] = useState<MsgPopup | null>(null);
  const popupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Última fecha de creación de mensaje que ya vimos/notificamos (ISO string, comparable lexicográficamente).
  const lastSeenAtRef = useRef<string | null>(null);
  const firstLoadRef = useRef(true);

  const fireNudge = useCallback(() => {
    try {
      const audio = new Audio('/sounds/mensaje-nuevo.mp3');
      audio.volume = 1.0;
      audio.play().catch((err) => {
        // Antes este error se tragaba en silencio (.catch(() => {})), lo que hacía
        // imposible distinguir un bloqueo de autoplay del navegador de otros fallos.
        console.warn('[notificaciones] No se pudo reproducir el sonido (posible bloqueo de autoplay):', err);
      });
    } catch (err) {
      console.warn('[notificaciones] Error creando el audio de notificación:', err);
    }
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      // Zumbido más fuerte y notorio: pulsos largos y sostenidos (el patrón anterior
      // era muy corto y casi no se sentía). Duraciones más largas = vibración más marcada.
      try { navigator.vibrate([450, 120, 450, 120, 600]); } catch {}
    }
    setNudgeTick((t) => t + 1);
  }, []);

  // Desplaza el feed hasta la publicación de la que te escribieron y la resalta.
  // Si esa tarjeta no está en la página actual (otra ruta, o aún no cargó en el
  // scroll infinito), simplemente no hace nada — el popup superior sigue visible.
  const resaltarPublicacion = useCallback((productId: string | null) => {
    if (!productId || typeof document === 'undefined') return;
    // Pequeño retraso para dar tiempo a que el popup se monte y el DOM esté listo.
    setTimeout(() => {
      const el = document.getElementById('producto-' + productId);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.remove('resaltar-mensaje');
      // Fuerza el reinicio de la animación si ya estaba aplicada.
      void el.offsetWidth;
      el.classList.add('resaltar-mensaje');
      setTimeout(() => el.classList.remove('resaltar-mensaje'), 2600);
    }, 150);
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
              if (!firstLoadRef.current) {
                fireNudge();
                // Popup enriquecido: quién te escribió y sobre qué producto.
                setMsgPopup({
                  from: d.latestFrom ?? null,
                  title: d.latestProductTitle ?? null,
                  image: d.latestProductImage ?? null,
                  productId: d.latestProductId ?? null,
                });
                // El popup NO se cierra solo: se queda hasta que el usuario lo lea
                // (toca la tarjeta o la × ). Antes desaparecía a los 7s y se perdía.
                if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
                // Segundo recordatorio: si la publicación está en el feed actual,
                // desplázate hasta ella y resáltala (además del popup superior).
                resaltarPublicacion(d.latestProductId ?? null);
              }
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

  const abrirProducto = () => {
    const id = msgPopup?.productId;
    setMsgPopup(null);
    if (id) router.push(`/product/${id}`);
    else router.push('/mensajes');
  };

  return (
    <NotificationContext.Provider value={{ unreadTotal, nudgeTick }}>
      {children}
      {msgPopup && (
        <div
          onClick={abrirProducto}
          style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            zIndex: 9800, cursor: 'pointer', width: 'min(360px, calc(100vw - 32px))',
            background: '#fff', borderRadius: 16, padding: 12,
            boxShadow: '0 12px 40px rgba(10,46,107,0.28)', border: `1px solid ${THEME.border}`,
            display: 'flex', alignItems: 'center', gap: 12, animation: 'slideIn 0.3s',
          }}
        >
          {msgPopup.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={msgPopup.image} alt="" style={{ width: 46, height: 46, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 46, height: 46, borderRadius: 10, background: THEME.primary, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>💬</div>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: THEME.text }}>
              💬 {msgPopup.from || 'Alguien'} te escribió
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 12.5, color: THEME.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {msgPopup.title ? `Sobre: ${msgPopup.title}` : 'Toca para ver el mensaje'}
            </p>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); if (popupTimerRef.current) clearTimeout(popupTimerRef.current); setMsgPopup(null); }}
            style={{ border: 'none', background: 'transparent', color: THEME.muted, fontSize: 18, fontWeight: 700, cursor: 'pointer', flexShrink: 0, lineHeight: 1 }}
            aria-label="Cerrar"
          >×</button>
        </div>
      )}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationContext);
