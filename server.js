const { createServer } = require('http');
const next = require('next');
const { Server } = require('socket.io');
const cron = require('node-cron');

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

  // Simple auth middleware — clients must send their NextAuth session token
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    // Store userId from token for room authorization later
    socket.data.token = token;
    next();
  });

  io.on('connection', (socket) => {
    console.log('🟢 Nuevo cliente conectado:', socket.id);

    socket.on('join-room', ({ userId, productId }) => {
      if (!productId || typeof productId !== 'string') return;
      // Each socket can only join rooms relevant to their userId
      socket.data.userId = userId;
      socket.join(`product-${productId}`);
      console.log(`Usuario ${userId} se unió a sala product-${productId}`);
    });

    socket.on('send-message', (data) => {
      if (!data?.productId || typeof data.productId !== 'string') return;
      // Only broadcast to the specific product room
      io.to(`product-${data.productId}`).emit('new-message', data);
    });

    socket.on('product-updated', (data) => {
      if (!data?.productId || typeof data.productId !== 'string') return;
      io.to(`product-${data.productId}`).emit('product-status-changed', data);
    });

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
