const { createServer } = require('http');
const { Server } = require('socket.io');

const httpServer = createServer();

const io = new Server(httpServer, {
  cors: {
    origin: 'http://localhost:3006',
    methods: ['GET', 'POST'],
  },
});

io.on('connection', (socket) => {
  console.log('🟢 Nuevo cliente conectado:', socket.id);

  socket.on('join-room', ({ userId, productId }) => {
    socket.join(`product-${productId}`);
    console.log(`Usuario ${userId} se unió a sala product-${productId}`);
  });

  socket.on('send-message', (data) => {
    io.to(`product-${data.productId}`).emit('new-message', data);
  });

  socket.on('product-updated', (data) => {
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
