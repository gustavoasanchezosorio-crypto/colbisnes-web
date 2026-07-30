const { createServer } = require('http');
const next = require('next');
const { Server } = require('socket.io');
const cron = require('node-cron');
const { getToken } = require('next-auth/jwt');
const cookie = require('cookie');

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3006', 10);

const app = next({ dev });
const handle = app.getRequestHandler();

const ALLOWED_ORIGINS = [
  // 2026-07-30: el dominio de producción faltaba en esta lista. Funcionaba de
  // pura carambola: el navegador no manda cabecera `Origin` en peticiones
  // same-origin, así que caía en el `if (!origin) return true` de abajo. Bastaba
  // con que algo cambiara —un subdominio, una petición cross-origin legítima,
  // un cliente que sí mande Origin— para que el chat en vivo dejara de conectar
  // sin ninguna razón aparente. Ahora está explícito.
  'https://colbisnes.com',
  'https://www.colbisnes.com',
  'http://localhost:3006',
  'http://localhost:3000',
  'https://colbisnes-web.vercel.app',
];

function isAllowedOrigin(origin) {
  // Se conserva a propósito: las peticiones same-origin del propio sitio llegan
  // sin cabecera `Origin`. Ya no es lo que sostiene a colbisnes.com —ese dominio
  // está explícito arriba—, pero quitarlo rompería otros clientes legítimos.
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Railway assigns *.up.railway.app subdomains for previews/production
  if (/^https:\/\/[a-z0-9-]+\.up\.railway\.app$/.test(origin)) return true;
  return false;
}

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));

  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Origin not allowed'));
        }
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Se expone `io` a las rutas de API de Next.js que corren en este MISMO proceso
  // (servidor a medida sobre Railway, ya no serverless) para poder emitir eventos
  // en tiempo real sin un segundo canal. Antes app/api/offers/route.ts hacía
  // `require("@/server.js")` esperando encontrar `io` ahí, pero este archivo nunca
  // exportaba nada — ese require devolvía un objeto vacío y cada emit fallaba en
  // silencio (try/catch vacío alrededor). El aviso en tiempo real de "oferta
  // aceptada, tienes 10 minutos para pagar" nunca llegaba a disparar; el polling
  // de 5s en la página de producto disimulaba el problema (auditoría 2026-07-06).
  global.io = io;

  // Autenticación real del socket. Antes bastaba con que `auth.token` no viniera
  // vacío — hasta el literal "anonymous" que manda el cliente para las vistas
  // públicas de producto lo cumplía — y ese valor nunca se verificaba contra nada:
  // cualquiera podía conectarse alegando cualquier userId, que luego se guardaba
  // tal cual para usarse después en "join-room" y "send-message" (auditoría
  // 2026-07-06). Ahora la identidad del socket sale ÚNICAMENTE de la cookie de
  // sesión real de NextAuth (la misma que ya viaja en el handshake por ser
  // same-origin), desencriptada y verificada con NEXTAUTH_SECRET. Si no hay
  // cookie de sesión o es inválida, el socket queda anónimo (userId=null) — eso
  // sigue permitido a propósito, porque ver el estado de un producto es
  // información pública — pero un socket anónimo no puede enviar mensajes ni
  // suplantar a otro usuario (ver "send-message" más abajo).
  // -------------------------------------------------------------------------
  // 2026-07-30 — Endurecimiento de la verificación de sesión del socket.
  //
  // Motivo: GHSA-xmf8-cvqr-rfgj, "getToken() throws an uncaught exception on
  // malformed Bearer authorization headers". La vulnerabilidad en sí ya quedó
  // corregida al subir next-auth 4.24.14 -> 4.24.15, pero esta defensa se deja
  // puesta a propósito, por dos razones:
  //
  //   1. Las cabeceras que se le entregan a getToken() vienen ENTERAS del
  //      cliente en el handshake. Es entrada no confiable por definición.
  //   2. Este proceso no solo sirve el sitio: también hospeda los dos cron de
  //      node-cron (liberación de escrow y verificación de envíos). Una
  //      excepción no controlada aquí no tumba "el chat": tumba el proceso que
  //      mueve la plata de la gente.
  // -------------------------------------------------------------------------

  // Solo se acepta una cabecera Authorization con la forma exacta
  // "Bearer <token>" y únicamente con caracteres ASCII del alfabeto base64url.
  // Cualquier otra cosa (bytes no ASCII, cabecera partida, basura) se descarta
  // ANTES de entregársela a la librería de autenticación.
  const AUTHORIZATION_VALIDA = /^Bearer [A-Za-z0-9._~+/-]+=*$/;
  const AUTHORIZATION_MAX_LARGO = 4096;

  function sanearAuthorization(headers) {
    const limpias = { ...headers };
    const valor = limpias.authorization ?? limpias.Authorization;
    if (valor === undefined) return limpias;
    const invalida =
      typeof valor !== 'string' ||
      valor.length > AUTHORIZATION_MAX_LARGO ||
      !AUTHORIZATION_VALIDA.test(valor);
    if (invalida) {
      delete limpias.authorization;
      delete limpias.Authorization;
    }
    return limpias;
  }

  io.use(async (socket, next) => {
    const headers = socket.handshake.headers || {};

    // El parseo de cookies es tolerante a propósito y va FUERA del try que
    // decide el rechazo: una cookie de terceros malformada no debería costarle
    // la conexión a un visitante legítimo que solo viene a mirar un producto.
    let parsedCookies = {};
    try {
      parsedCookies = headers.cookie ? cookie.parse(headers.cookie) : {};
    } catch {
      parsedCookies = {};
    }

    try {
      const verifiedToken = await getToken({
        req: { cookies: parsedCookies, headers: sanearAuthorization(headers) },
        secret: process.env.NEXTAUTH_SECRET,
      });
      // Ojo con esta distinción, que es la parte delicada: "no hay sesión"
      // (getToken devuelve null) SIGUE permitido y sigue siendo anónimo, porque
      // ver el estado de un producto es información pública. Lo que ya no se
      // tolera es el caso de abajo.
      socket.data.userId = verifiedToken?.id || null;
      next();
    } catch (err) {
      // Fail-closed: si la verificación lanzó excepción, no sabemos quién es
      // este socket — y "no sé quién es" no puede tratarse como "es anónimo".
      console.error(
        'Socket rechazado: la verificación de sesión lanzó excepción:',
        err?.message || err
      );
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    console.log('🟢 Nuevo cliente conectado:', socket.id);

    socket.on('join-room', ({ productId }) => {
      if (!productId || typeof productId !== 'string') return;
      // El estado de un producto es información pública (cualquier visitante
      // puede verla sin iniciar sesión), así que no se exige identidad para
      // unirse a esta sala. Lo que ya NO se hace es confiar en un `userId`
      // mandado por el cliente — ese campo se ignora por completo; la única
      // identidad real de este socket es `socket.data.userId`, ya verificada
      // en el middleware de arriba (auditoría 2026-07-06).
      socket.join(`product-${productId}`);
      console.log(`Socket ${socket.id} (userId=${socket.data.userId || 'anónimo'}) se unió a sala product-${productId}`);
    });

    socket.on('send-message', (data) => {
      if (!data?.productId || typeof data.productId !== 'string') return;
      // Un socket sin sesión verificada no puede enviar mensajes, y ninguno
      // puede hacerse pasar por otro usuario: `fromUserId` debe coincidir con
      // la identidad real ya verificada del socket, no con lo que el payload
      // diga (auditoría 2026-07-06). Nota: hoy ningún cliente en producción
      // emite este evento — el chat real usa /api/messages, con sesión, KYC
      // y rate limit — pero el servidor no debe depender de eso para ser
      // seguro.
      if (!socket.data.userId || data.fromUserId !== socket.data.userId) return;
      io.to(`product-${data.productId}`).emit('new-message', data);
    });

    // (Se retiró el handler `product-updated` que existía aquí: permitía que
    // CUALQUIER socket, sin ninguna verificación, transmitiera un
    // "product-status-changed" con datos arbitrarios a la sala de cualquier
    // producto. Ningún cliente lo usaba — los cambios de estado reales se
    // emiten directamente desde las rutas de API vía `global.io` (ver arriba)
    // — así que era superficie de ataque sin ningún beneficio (auditoría
    // 2026-07-06).)

    socket.on('disconnect', () => {
      console.log('🔴 Cliente desconectado:', socket.id);
    });
  });

  httpServer.listen(port, () => {
    console.log(`✅ Servidor listo (Next.js + WebSocket) en puerto ${port}`);
  });

  // Cron jobs (migrated from vercel.json — Vercel's cron infra no longer applies
  // once this runs as a persistent server). Same schedules, same endpoints; we just
  // trigger them ourselves via loopback HTTP instead of an external scheduler.
  async function runCron(path) {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      console.error(`⏭️  Cron ${path} omitido: falta CRON_SECRET`);
      return;
    }
    try {
      const res = await fetch(`http://127.0.0.1:${port}${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cronSecret}` },
      });
      const body = await res.text();
      console.log(`⏰ Cron ${path} → ${res.status}: ${body}`);
    } catch (err) {
      console.error(`❌ Cron ${path} falló:`, err);
    }
  }

  // -------------------------------------------------------------------------
  // 2026-07-30 — Interruptor para migrar a Railway Cron Jobs sin tocar código.
  //
  // Los dos endpoints de abajo YA aceptan llamadas externas: solo exigen la
  // cabecera `Authorization: Bearer <CRON_SECRET>` (ver lib/cronAuth.ts, que
  // compara en tiempo constante y falla cerrado). No hay filtro por IP, ni por
  // origen, ni restricción a localhost. Es decir, un programador externo como
  // Railway Cron Jobs puede dispararlos tal cual están hoy.
  //
  // El peligro al hacer esa migración es el solapamiento: si se configura el
  // cron en Railway y ADEMÁS sigue activo el node-cron de aquí dentro, la tarea
  // corre DOS VECES. Y una de las dos es /api/cron/liberar, que libera plata de
  // escrow hacia los vendedores. Doble ejecución en un camino de dinero no es un
  // log feo: es un problema contable.
  //
  // Por eso el apagado se hace por variable de entorno y no editando código: el
  // día que se active el cron en Railway, basta con poner
  // DISABLE_INTERNAL_CRON=true en el panel y reiniciar. Si la variable no existe
  // —que es el caso hoy— el comportamiento es exactamente el de siempre.
  //
  // Recordatorio relacionado: numReplicas debe seguir en 1. Con dos réplicas
  // estos cron internos también se duplicarían, por la misma razón.
  // -------------------------------------------------------------------------
  const cronInternoDesactivado = process.env.DISABLE_INTERNAL_CRON === 'true';

  if (cronInternoDesactivado) {
    console.log(
      '⏸️  Cron interno DESACTIVADO por DISABLE_INTERNAL_CRON=true. ' +
        'Se asume que un programador externo (Railway Cron Jobs) está llamando ' +
        '/api/cron/liberar y /api/cron/verificar-envios. Si no es así, la ' +
        'liberación de escrow NO se está ejecutando.'
    );
  } else {
    cron.schedule('0 0 * * *', () => runCron('/api/cron/liberar'), { timezone: 'UTC' });
    cron.schedule('5 1 * * *', () => runCron('/api/cron/verificar-envios'), { timezone: 'UTC' });
    console.log('⏰ Cron interno ACTIVO: liberar 00:00 UTC, verificar-envios 01:05 UTC.');
  }
});
