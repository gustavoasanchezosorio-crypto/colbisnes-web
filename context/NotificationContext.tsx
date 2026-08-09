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
  // Un único elemento de audio para toda la sesión (ver el efecto de desbloqueo).
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Última fecha de creación de mensaje que ya vimos/notificamos (ISO string, comparable lexicográficamente).
  const lastSeenAtRef = useRef<string | null>(null);
  const firstLoadRef = useRef(true);

  const fireNudge = useCallback(() => {
    // Ver el comentario del efecto de desbloqueo, más abajo: se reutiliza SIEMPRE
    // el mismo elemento, porque el permiso para sonar se le concede a ese elemento
    // en concreto, no a la página.
    const audio = audioRef.current;
    if (audio) {
      try {
        audio.currentTime = 0;
        audio.muted = false;
        audio.volume = 1.0;
        audio.play().catch((err) => {
          console.warn('[notificaciones] No se pudo reproducir el sonido (posible bloqueo de autoplay):', err);
        });
      } catch (err) {
        console.warn('[notificaciones] Error reproduciendo el audio de notificación:', err);
      }
    }
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      // Zumbido más fuerte y notorio: pulsos largos y sostenidos (el patrón anterior
      // era muy corto y casi no se sentía). Duraciones más largas = vibración más marcada.
      // Nota: en iPhone esto nunca hace nada — Safari no implementa la API de vibración.
      // El sonido y el aviso en pantalla son los que tienen que funcionar allí.
      try { navigator.vibrate([450, 120, 450, 120, 450, 120, 450, 120, 900, 150, 900]); } catch {}
    }
    setNudgeTick((t) => t + 1);
  }, []);

  // ── Por qué existe todo esto: el sonido no sonaba ────────────────────────────
  // Los navegadores (Safari en iPhone el más estricto) no dejan sonar un audio que
  // no nació de un gesto del usuario. El permiso se le da al ELEMENTO de audio que
  // se reprodujo durante ese gesto, no a la pestaña. Antes se creaba un `new Audio()`
  // en cada mensaje: cada uno era un elemento recién nacido que nadie había tocado,
  // así que siempre llegaba bloqueado y el mensaje entraba mudo.
  //
  // La solución es un solo elemento para toda la sesión, y "estrenarlo" con el primer
  // toque que el usuario dé en cualquier parte: se reproduce y se pausa en el acto,
  // en silencio, de modo que él no oye nada pero el navegador ya lo marcó como
  // permitido. De ahí en adelante suena solo cuando llega un mensaje.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const audio = new Audio('/sounds/mensaje-nuevo.mp3');
    audio.preload = 'auto';
    audioRef.current = audio;

    let listo = false;
    const desbloquear = () => {
      if (listo) return;
      listo = true;
      // Se silencia con `muted` y NO con `volume`: en iPhone, Safari ignora los
      // cambios de volumen por código (allí el volumen solo lo manda el botón
      // físico del teléfono), así que con volume=0 el usuario oiría el sonido
      // completo en su primer toque. `muted` sí lo respeta.
      audio.muted = true;
      audio.play()
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
        })
        .catch(() => {
          // Si aún así falla, se reintenta en el siguiente gesto.
          audio.muted = false;
          listo = false;
        });
    };

    // `pointerdown` cubre dedo y ratón; `keydown` cubre a quien navega con teclado.
    // Van en captura y sin `once` para poder reintentar si el primer intento falla.
    window.addEventListener('pointerdown', desbloquear, true);
    window.addEventListener('keydown', desbloquear, true);
    return () => {
      window.removeEventListener('pointerdown', desbloquear, true);
      window.removeEventListener('keydown', desbloquear, true);
    };
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

  // Al tocar el aviso hay que quedar EN LA CONVERSACIÓN, no en la ficha del producto
  // con el chat cerrado (que es lo que pasaba antes y obligaba a buscar el botón).
  // El `?chat=1` lo lee ProductPageClient y abre el panel correcto según quien mire:
  // al comprador le abre su conversación con el vendedor; al vendedor, su bandeja.
  const abrirProducto = () => {
    const id = msgPopup?.productId;
    setMsgPopup(null);
    if (id) router.push(`/product/${id}?chat=1`);
    else router.push('/mensajes');
  };

  return (
    <NotificationContext.Provider value={{ unreadTotal, nudgeTick }}>
      {children}
      {msgPopup && (
        <div
          onClick={abrirProducto}
          style={{
            // Arriba y centrado, como cualquier notificación del teléfono: es donde
            // la gente la busca y donde intenta tocarla. Antes salía en mitad de la
            // pantalla. El `safe-area-inset-top` la baja bajo la muesca del iPhone.
            position: 'fixed', top: 'calc(14px + env(safe-area-inset-top))',
            left: '50%', transform: 'translateX(-50%)',
            // Por encima de todo lo demás (el chat de Chucho va en 1900).
            zIndex: 9900, cursor: 'pointer', width: 'min(360px, calc(100vw - 32px))',
            background: '#fff', borderRadius: 16, padding: 12,
            // Borde dorado metálico: anillos superpuestos (oro oscuro → oro claro)
            // que siguen las esquinas redondeadas y dan aspecto de metal pulido.
            border: '2px solid transparent',
            boxShadow: '0 0 0 1px #7a5c12, 0 0 0 3px #d4af37, 0 0 0 4px #f7e79b, 0 0 0 5px #b8860b, 0 14px 44px rgba(10,46,107,0.35)',
            // OJO: aquí decía `slideIn`, una animación que no está definida en ninguna
            // hoja del proyecto — o sea, no hacía nada. `notifBajar` sí existe
            // (globals.css) y baja el aviso desde el borde superior.
            display: 'flex', alignItems: 'center', gap: 12,
            animation: 'notifBajar 0.34s cubic-bezier(0.22,1,0.36,1)',
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
