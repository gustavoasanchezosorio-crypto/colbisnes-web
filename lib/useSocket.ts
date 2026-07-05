import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    // Product status updates are public (viewers don't need to be logged in);
    // the server only checks that some token is present, not who it belongs to.
    socket = io({ auth: { token: "anonymous" } });
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
