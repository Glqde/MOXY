// src/lib/socket.ts
// Typed Socket.IO client.
// Single instance — shared across the entire app via the useSocket hook.

import { io, Socket } from "socket.io-client";
import type { WsEvent, WsMemberPresence, WsTaskCompleted, WsTaskReset } from "@/types";

const WS_URL = import.meta.env.VITE_WS_URL ?? "http://localhost:8000";

// Typed event map for Socket.IO
interface ServerToClientEvents {
  task_completed: (data: WsTaskCompleted) => void;
  task_reset: (data: WsTaskReset) => void;
  member_presence: (data: WsMemberPresence) => void;
  error: (data: { message: string }) => void;
}

interface ClientToServerEvents {
  join_group: (data: { group_id: string }) => void;
  leave_group: (data: { group_id: string }) => void;
  heartbeat: (data: Record<string, never>) => void;
}

export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: TypedSocket | null = null;

/**
 * Returns the shared Socket.IO socket instance.
 * Creates it on first call with the provided auth token.
 * Subsequent calls return the existing instance (even if token changes —
 * use reconnect() to force a new connection on re-login).
 */
export function getSocket(token: string): TypedSocket {
  if (socket?.connected) return socket;

  socket = io(WS_URL, {
    path: "/ws/socket.io",
    auth: { token },
    transports: ["websocket", "polling"],   // websocket first, fallback to polling
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
    timeout: 10_000,
    forceNew: false,
  }) as TypedSocket;

  // Global error handler — individual hooks add their own listeners too
  socket.on("connect_error", (err) => {
    console.error("[socket] connection error:", err.message);
  });

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function reconnectSocket(token: string): TypedSocket {
  disconnectSocket();
  return getSocket(token);
}
