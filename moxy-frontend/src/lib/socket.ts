// src/lib/socket.ts
// Typed Socket.IO client.
// Single instance — shared across the entire app via the useSocket hook.

import { io, Socket } from "socket.io-client";
import { supabase } from "@/lib/supabase";
import type {
  WsChatMessage, WsChatMessageDeleted, WsGroupInvite, WsMemberPresence, WsMemberRemoved, WsRemovedFromGroup, WsTyping,
  WsTaskCompleted, WsTaskCompletionUndone, WsTaskReset,
} from "@/types";

// Realtime is served by the API itself, so default to the API origin
const WS_URL = import.meta.env.VITE_WS_URL ?? import.meta.env.VITE_API_URL ?? "http://localhost:8000";

// Typed event map for Socket.IO
interface ServerToClientEvents {
  task_completed: (data: WsTaskCompleted) => void;
  task_completion_undone: (data: WsTaskCompletionUndone) => void;
  task_reset: (data: WsTaskReset) => void;
  member_presence: (data: WsMemberPresence) => void;
  group_invite: (data: WsGroupInvite) => void;
  removed_from_group: (data: WsRemovedFromGroup) => void;
  member_removed: (data: WsMemberRemoved) => void;
  chat_message: (data: WsChatMessage) => void;
  chat_message_deleted: (data: WsChatMessageDeleted) => void;
  typing: (data: WsTyping) => void;
  error: (data: { message: string }) => void;
}

interface ClientToServerEvents {
  join_group: (data: { group_id: string }) => void;
  leave_group: (data: { group_id: string }) => void;
  heartbeat: (data: Record<string, never>) => void;
  typing: (data: { group_id: string }) => void;
}

export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: TypedSocket | null = null;

/**
 * Returns the shared Socket.IO socket, creating it on first call.
 * The auth payload is fetched on every (re)connect, so reconnects after the
 * hourly Supabase token refresh use the fresh token instead of a stale one.
 */
export function getSocket(): TypedSocket {
  if (socket) return socket;

  socket = io(WS_URL, {
    path: "/ws/socket.io",
    auth: (cb) => {
      supabase.auth.getSession().then(({ data }) => cb({ token: data.session?.access_token }));
    },
    // WebSocket only: long-polling needs sticky sessions across API workers
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
    timeout: 10_000,
  }) as TypedSocket;

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
