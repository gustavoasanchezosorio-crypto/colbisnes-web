import { useEffect, useState } from 'react';
import io, { Socket } from 'socket.io-client';

export const useSocket = (userId?: string) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!userId) return;

    const socketIo = io({ auth: { token: userId } });
    setSocket(socketIo);

    socketIo.on('connect', () => {
      console.log('✅ Conectado al servidor WebSocket, ID:', socketIo.id);
      setIsConnected(true);
    });

    socketIo.on('disconnect', () => {
      console.log('❌ Desconectado del servidor WebSocket');
      setIsConnected(false);
    });

    socketIo.on('connect_error', (err) => {
      console.error('⚠️ Error de conexión WebSocket:', err.message);
    });

    return () => {
      socketIo.disconnect();
    };
  }, [userId]);

  return { socket, isConnected };
};
