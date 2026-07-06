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
  'http://localhost:3006',
  'http://localhost:3000',
  'https://colbisnes-web.vercel.app',
];

function isAllowedOrigin(origin) {
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
  io.use(async (socket, next) => {
    try {
      const cookieHeader = socket.handshake.headers?.cookie;
      const parsedCookies = cookieHeader ? cookie.parse(cookieHeader) : {};
      const verifiedToken = await getToken({
        req: { cookies: parsedCookies, headers: socket.handshake.headers },
        secret: process.env.NEXTAUTH_SECRET,
      });
      socket.data.userId = verifiedToken?.id || null;
    } catch (err) {
      console.error('Error verificando sesión en socket (se trata como anónimo):', err);
      socket.data.userId = null;
    }
    next();
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

  cron.schedule('0 0 * * *', () => runCron('/api/cron/liberar'), { timezone: 'UTC' });
  cron.schedule('5 1 * * *', () => runCron('/api/cron/verificar-envios'), { timezone: 'UTC' });
});
