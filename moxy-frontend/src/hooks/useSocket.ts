// src/hooks/useSocket.ts
// The real-time brain of the frontend.
//
// Responsibilities:
//   1. Connect to Socket.IO with the user's JWT
//   2. Join group rooms for task + presence events
//   3. Handle incoming events → update TanStack Query cache
//   4. Show toast notifications for relevant events
//   5. Update presence store
//   6. Send heartbeat every 30s to maintain online status
//   7. Clean up on unmount / group change

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSocket, disconnectSocket, type TypedSocket } from "@/lib/socket";
import { useAuthStore, usePresenceStore, useToastStore } from "@/store";
import { QK } from "./useQueries";
import type { TaskRead, WsMemberPresence, WsTaskCompleted, WsTaskReset } from "@/types";

interface UseSocketOptions {
  groupIds: string[];  // rooms to join
  enabled?: boolean;
}

export function useSocket({ groupIds, enabled = true }: UseSocketOptions) {
  const token = useAuthStore((s) => s.token);
  const { addToast } = useToastStore.getState();
  const { setOnline, setOffline } = usePresenceStore.getState();
  const qc = useQueryClient();

  const socketRef = useRef<TypedSocket | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Event handlers (stable refs — don't recreate on every render) ─────────

  const handleTaskCompleted = (data: WsTaskCompleted) => {
    const { task_id, task_title, task_emoji, completed_by_name, group_id } = data;

    // Update the task in TanStack Query cache immediately
    qc.setQueryData<TaskRead[]>(QK.tasks(group_id), (old) =>
      old?.map((t) =>
        t.id === task_id
          ? { ...t, is_completed_this_period: true }
          : t
      ) ?? []
    );

    // Invalidate to sync with server truth (gets latest_completion populated)
    qc.invalidateQueries({ queryKey: QK.tasks(group_id) });

    // Invalidate notifications (new one was created by Celery)
    qc.invalidateQueries({ queryKey: QK.notifications });
    qc.invalidateQueries({ queryKey: QK.unreadCount });

    // Show toast (will show even for current user's own completion — filter if desired)
    addToast({
      emoji: task_emoji,
      title: `${completed_by_name} completed ${task_title}`,
      sub: "Just now",
    });
  };

  const handleTaskReset = (data: WsTaskReset) => {
    const { task_id, task_title, task_emoji, group_id } = data;

    // Mark task as pending again in cache
    qc.setQueryData<TaskRead[]>(QK.tasks(group_id), (old) =>
      old?.map((t) =>
        t.id === task_id
          ? { ...t, is_completed_this_period: false, latest_completion: null }
          : t
      ) ?? []
    );

    addToast({
      emoji: task_emoji,
      title: `${task_title} is ready again`,
      sub: "New recurrence period started",
      type: "info",
    });
  };

  const handlePresence = (data: WsMemberPresence) => {
    if (data.online) {
      setOnline(data.user_id);
    } else {
      setOffline(data.user_id);
    }
  };

  // ── Socket lifecycle ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!enabled || !token) return;

    const socket = getSocket(token);
    socketRef.current = socket;

    // Attach event listeners
    socket.on("task_completed", handleTaskCompleted);
    socket.on("task_reset", handleTaskReset);
    socket.on("member_presence", handlePresence);

    // Join group rooms once connected
    const joinGroups = () => {
      groupIds.forEach((id) => {
        socket.emit("join_group", { group_id: id });
      });
    };

    if (socket.connected) {
      joinGroups();
    } else {
      socket.once("connect", joinGroups);
    }

    // Heartbeat — maintains online presence in Redis
    heartbeatRef.current = setInterval(() => {
      socket.emit("heartbeat", {});
    }, 30_000);

    return () => {
      // Leave group rooms
      groupIds.forEach((id) => {
        socket.emit("leave_group", { group_id: id });
      });

      // Remove listeners (don't disconnect — socket is shared)
      socket.off("task_completed", handleTaskCompleted);
      socket.off("task_reset", handleTaskReset);
      socket.off("member_presence", handlePresence);

      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
    };
  }, [enabled, token, groupIds.join(",")]); // re-run when group list changes

  // Disconnect on logout
  useEffect(() => {
    if (!token) disconnectSocket();
  }, [token]);

  return {
    isConnected: socketRef.current?.connected ?? false,
  };
}
