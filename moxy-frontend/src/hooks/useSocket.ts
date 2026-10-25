// src/hooks/useSocket.ts
// The real-time brain of the frontend.
//
// Responsibilities:
//   1. Connect to Socket.IO once per signed-in session
//   2. Handle incoming events → update TanStack Query cache
//   3. Show toast notifications for other members' actions
//   4. Update presence store
//   5. Send heartbeat every 30s to maintain online status
//   6. Join rooms for groups joined after connecting (the server joins
//      existing groups on connect)

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSocket, disconnectSocket } from "@/lib/socket";
import { useAuthStore, usePresenceStore, useToastStore, useUIStore } from "@/store";
import { QK } from "./useQueries";
import { playSound } from "@/lib/sounds";
import { notifyDesktop } from "@/lib/desktopNotify";
import type {
  TaskRead, WsGroupInvite, WsMemberPresence, WsMemberRemoved, WsRemovedFromGroup,
  WsTaskCompleted, WsTaskCompletionUndone, WsTaskReset,
} from "@/types";

interface UseSocketOptions {
  groupIds: string[];
  enabled?: boolean;
}

export function useSocket({ groupIds, enabled = true }: UseSocketOptions) {
  const userId = useAuthStore((s) => s.user?.id);
  const qc = useQueryClient();
  const [isConnected, setConnected] = useState(false);

  // ── Socket lifecycle + event handlers ────────────────────────────────────

  useEffect(() => {
    if (!enabled || !userId) return;

    const socket = getSocket();
    const { addToast } = useToastStore.getState();
    const { setOnline, setOffline } = usePresenceStore.getState();

    const patchTask = (groupId: string, taskId: string, patch: Partial<TaskRead>) => {
      qc.setQueryData<TaskRead[]>(QK.tasks(groupId), (old) =>
        old?.map((t) => (t.id === taskId ? { ...t, ...patch } : t))
      );
      // Sync with server truth (latest_completion, streaks, next period)
      qc.invalidateQueries({ queryKey: QK.tasks(groupId) });
    };

    const handleTaskCompleted = (data: WsTaskCompleted) => {
      patchTask(data.group_id, data.task_id, { is_completed_this_period: true });
      qc.invalidateQueries({ queryKey: QK.notifications }); // also covers unread count
      qc.invalidateQueries({ queryKey: QK.activityAll });
      // Our own completions get their popup + sound from the mutation
      if (data.completed_by_id !== userId) {
        const title = `${data.completed_by_name} completed ${data.task_title}`;
        addToast({ emoji: data.task_emoji, title, sub: "Just now" });
        playSound("complete");
        notifyDesktop(`${data.task_emoji} ${title}`, "MOXY", `task-${data.task_id}`);
      }
    };

    const handleTaskUndone = (data: WsTaskCompletionUndone) => {
      patchTask(data.group_id, data.task_id, { is_completed_this_period: false, latest_completion: null });
      qc.invalidateQueries({ queryKey: QK.activityAll });
      if (data.undone_by_id !== userId) {
        const title = `${data.undone_by_name} undid ${data.task_title}`;
        addToast({ emoji: "↩️", title, type: "info" });
        playSound("undo");
        notifyDesktop(`↩️ ${title}`, "MOXY", `task-${data.task_id}`);
      }
    };

    const handleTaskReset = (data: WsTaskReset) => {
      patchTask(data.group_id, data.task_id, { is_completed_this_period: false, latest_completion: null });
      addToast({
        emoji: data.task_emoji,
        title: `${data.task_title} is ready again`,
        sub: "New recurrence period started",
        type: "info",
      });
    };

    const handlePresence = (data: WsMemberPresence) => {
      if (data.online) setOnline(data.user_id);
      else setOffline(data.user_id);
    };

    // Someone added us to a group: show it in the sidebar straight away
    const handleGroupInvite = (data: WsGroupInvite) => {
      qc.invalidateQueries({ queryKey: QK.groups });
      qc.invalidateQueries({ queryKey: QK.notifications });
      const title = `${data.invited_by_name} added you to ${data.group_name}`;
      addToast({ emoji: data.group_icon, title });
      playSound("create");
      notifyDesktop(`${data.group_icon} ${title}`, "MOXY", `group-${data.group_id}`);
    };

    // An admin removed us: drop the group from the sidebar and leave its page
    const handleRemovedFromGroup = (data: WsRemovedFromGroup) => {
      qc.invalidateQueries({ queryKey: QK.groups });
      qc.invalidateQueries({ queryKey: QK.notifications });
      const ui = useUIStore.getState();
      if (ui.activeGroupId === data.group_id) ui.setActiveGroup(null);
      if (data.removed_by_name) {
        const title = `${data.removed_by_name} removed you from ${data.group_name}`;
        addToast({ emoji: data.group_icon, title, type: "info" });
        playSound("delete");
        notifyDesktop(`${data.group_icon} ${title}`, "MOXY", `group-${data.group_id}`);
      }
    };

    const handleMemberRemoved = (data: WsMemberRemoved) => {
      qc.invalidateQueries({ queryKey: QK.groupMembers(data.group_id) });
      qc.invalidateQueries({ queryKey: QK.groups }); // member counts
    };

    const handleConnect = () => {
      setConnected(true);
      setOnline(userId); // the server doesn't echo our own presence back to us
      // Catch up on anything missed while disconnected
      qc.invalidateQueries({ queryKey: ["tasks"] });
    };
    const handleDisconnect = () => setConnected(false);

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("task_completed", handleTaskCompleted);
    socket.on("task_completion_undone", handleTaskUndone);
    socket.on("task_reset", handleTaskReset);
    socket.on("member_presence", handlePresence);
    socket.on("group_invite", handleGroupInvite);
    socket.on("removed_from_group", handleRemovedFromGroup);
    socket.on("member_removed", handleMemberRemoved);
    if (socket.connected) setConnected(true);

    const heartbeat = setInterval(() => socket.emit("heartbeat", {}), 30_000);

    return () => {
      clearInterval(heartbeat);
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("task_completed", handleTaskCompleted);
      socket.off("task_completion_undone", handleTaskUndone);
      socket.off("task_reset", handleTaskReset);
      socket.off("member_presence", handlePresence);
      socket.off("group_invite", handleGroupInvite);
      socket.off("removed_from_group", handleRemovedFromGroup);
      socket.off("member_removed", handleMemberRemoved);
      disconnectSocket();
      setConnected(false);
    };
  }, [enabled, userId]);

  // ── Rooms for groups created/joined after connecting ─────────────────────

  const groupKey = groupIds.join(",");
  useEffect(() => {
    if (!isConnected) return;
    const socket = getSocket();
    // Server ignores groups it already joined us to, so this is cheap
    groupIds.forEach((id) => socket.emit("join_group", { group_id: id }));
  }, [isConnected, groupKey]);

  return { isConnected };
}
