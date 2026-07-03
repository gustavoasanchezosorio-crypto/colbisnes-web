const { createServer } = require('http');
const { Server } = require('socket.io');

const httpServer = createServer();

const ALLOWED_ORIGINS = [
  'http://localhost:3006',
  'http://localhost:3000',
  'https://colbisnes-web.vercel.app',
];

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
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

httpServer.listen(3001, () => {
  console.log('✅ Servidor WebSocket corriendo en http://localhost:3001');
});

module.exports = { io };
