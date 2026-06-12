import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io("http://localhost:3001");
  }
  return socket;
}

export function useProductSocket(productId: string, onStatusChange: (data: any) => void) {
  const userId = useRef<string>("anonymous");

  useEffect(() => {
    if (!productId) return;
    const s = getSocket();
    s.emit("join-room", { userId: userId.current, productId });
    s.on("product-status-changed", onStatusChange);
    return () => { s.off("product-status-changed", onStatusChange); };
  }, [productId, onStatusChange]);
}
