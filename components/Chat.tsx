'use client';

import { useState, useEffect, useRef } from 'react';
import { useSocket } from '@/hooks/useSocket';
import { useSession } from 'next-auth/react';
import { Button } from './FormComponents';
import { THEME } from '@/lib/theme';

interface ChatProps {
  productId: string;
  sellerId: string;
}

export default function Chat({ productId, sellerId }: ChatProps) {
  const { data: session } = useSession();
  const { socket, isConnected } = useSocket(session?.user?.id);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (socket && session?.user?.id) {
      socket.emit('join-room', { userId: session.user.id, productId });
    }
  }, [socket, session, productId]);

  useEffect(() => {
    if (!socket) return;
    socket.on('new-message', (data) => {
      setMessages((prev) => [...prev, data]);
    });
    return () => {
      socket.off('new-message');
    };
  }, [socket]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !socket || !session?.user?.id) return;

    const messageData = {
      fromUserId: session.user.id,
      toUserId: sellerId,
      productId,
      content: newMessage.trim(),
      createdAt: new Date(),
    };
    socket.emit('send-message', messageData);
    setMessages((prev) => [...prev, messageData]);
    setNewMessage('');
  };

  if (!session) return <p>Inicia sesión para chatear</p>;

  return (
    <div style={{ marginTop: '2rem', borderTop: `1px solid ${THEME.border}`, paddingTop: '1.5rem' }}>
      <h3 style={{ color: THEME.primary, marginBottom: '1rem' }}>
        Chat con el vendedor {isConnected ? '🟢' : '🔴'}
      </h3>
      <div style={{
        maxHeight: '300px',
        overflowY: 'auto',
        border: `1px solid ${THEME.border}`,
        borderRadius: '12px',
        padding: '1rem',
        marginBottom: '1rem'
      }}>
        {messages.length === 0 ? (
          <p style={{ color: THEME.muted, textAlign: 'center' }}>No hay mensajes aún. ¡Envía el primero!</p>
        ) : (
          messages.map((msg, index) => (
            <div
              key={index}
              style={{
                display: 'flex',
                justifyContent: msg.fromUserId === session.user.id ? 'flex-end' : 'flex-start',
                marginBottom: '0.5rem',
              }}
            >
              <div
                style={{
                  background: msg.fromUserId === session.user.id ? THEME.primary : THEME.border,
                  color: msg.fromUserId === session.user.id ? 'white' : THEME.text,
                  padding: '0.5rem 1rem',
                  borderRadius: '20px',
                  maxWidth: '70%',
                }}
              >
                <p style={{ margin: 0 }}>{msg.content}</p>
                <small style={{ fontSize: '0.7rem', opacity: 0.7 }}>
                  {new Date(msg.createdAt).toLocaleTimeString()}
                </small>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={sendMessage} style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Escribe un mensaje..."
          style={{
            flex: 1,
            padding: '0.75rem',
            borderRadius: '30px',
            border: `1px solid ${THEME.border}`,
            fontSize: '0.9rem',
          }}
        />
        <Button type="submit" disabled={!isConnected} style={{ padding: '0.75rem 2rem' }}>
          Enviar
        </Button>
      </form>
    </div>
  );
}
