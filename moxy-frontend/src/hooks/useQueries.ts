// src/hooks/useQueries.ts
// TanStack Query hooks — centralized data fetching with caching + optimistic updates.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { groupApi, notificationApi, taskApi, userApi } from "@/api/services";
import { useToastStore } from "@/store";
import type { TaskRead } from "@/types";

// ─── Query keys (centralized to enable precise invalidation) ──────────────────

export const QK = {
  me: ["me"] as const,
  groups: ["groups"] as const,
  group: (id: string) => ["group", id] as const,
  groupMembers: (id: string) => ["group", id, "members"] as const,
  tasks: (groupId: string) => ["tasks", groupId] as const,
  task: (groupId: string, taskId: string) => ["task", groupId, taskId] as const,
  notifications: ["notifications"] as const,
  unreadCount: ["notifications", "unread"] as const,
  friends: ["friends"] as const,
};

// ─── User ─────────────────────────────────────────────────────────────────────

export function useMe() {
  return useQuery({ queryKey: QK.me, queryFn: userApi.me, staleTime: 60_000 });
}

export function useUpdateMe() {
  const qc = useQueryClient();
  const { addToast } = useToastStore.getState();
  return useMutation({
    mutationFn: userApi.updateMe,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.me });
      addToast({ emoji: "✅", title: "Profile updated" });
    },
  });
}

export function useSearchUsers(q: string) {
  return useQuery({
    queryKey: ["search", q],
    queryFn: () => userApi.search(q),
    enabled: q.length >= 2,
    staleTime: 10_000,
  });
}

export function useFriends() {
  return useQuery({ queryKey: QK.friends, queryFn: userApi.friends });
}

// ─── Groups ───────────────────────────────────────────────────────────────────

export function useGroups() {
  return useQuery({ queryKey: QK.groups, queryFn: groupApi.list, staleTime: 30_000 });
}

export function useGroup(id: string) {
  return useQuery({
    queryKey: QK.group(id),
    queryFn: () => groupApi.get(id),
    enabled: !!id,
  });
}

export function useGroupMembers(groupId: string) {
  return useQuery({
    queryKey: QK.groupMembers(groupId),
    queryFn: () => groupApi.members(groupId),
    enabled: !!groupId,
    staleTime: 20_000,
  });
}

export function useCreateGroup() {
  const qc = useQueryClient();
  const { addToast } = useToastStore.getState();
  return useMutation({
    mutationFn: groupApi.create,
    onSuccess: (group) => {
      qc.invalidateQueries({ queryKey: QK.groups });
      addToast({ emoji: group.icon, title: `${group.name} created!` });
    },
  });
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export function useTasks(groupId: string) {
  return useQuery({
    queryKey: QK.tasks(groupId),
    queryFn: () => taskApi.list(groupId),
    enabled: !!groupId,
    staleTime: 10_000,
  });
}

export function useCreateTask(groupId: string) {
  const qc = useQueryClient();
  const { addToast } = useToastStore.getState();
  return useMutation({
    mutationFn: (data: Parameters<typeof taskApi.create>[1]) =>
      taskApi.create(groupId, data),
    onSuccess: (task) => {
      qc.invalidateQueries({ queryKey: QK.tasks(groupId) });
      addToast({ emoji: task.emoji, title: `"${task.title}" added` });
    },
  });
}

/**
 * THE critical mutation — optimistic update with rollback.
 *
 * Flow:
 *   1. Immediately mark task as completed in the query cache (optimistic)
 *   2. POST to backend — if 409 (someone else got there first), roll back
 *   3. On success, update cache with real server data + show toast
 */
export function useCompleteTask(groupId: string) {
  const qc = useQueryClient();
  const { addToast } = useToastStore.getState();

  return useMutation({
    mutationFn: ({ taskId, note }: { taskId: string; note?: string }) =>
      taskApi.complete(groupId, taskId, note),

    // ── Optimistic update ──────────────────────────────────────────────────
    onMutate: async ({ taskId }) => {
      // Cancel any in-flight refetches (prevent overwriting optimistic state)
      await qc.cancelQueries({ queryKey: QK.tasks(groupId) });

      // Snapshot current state for rollback
      const previous = qc.getQueryData<TaskRead[]>(QK.tasks(groupId));

      // Optimistically update the cache
      qc.setQueryData<TaskRead[]>(QK.tasks(groupId), (old) =>
        old?.map((t) =>
          t.id === taskId
            ? { ...t, is_completed_this_period: true }
            : t
        ) ?? []
      );

      return { previous };
    },

    // ── Rollback on error ──────────────────────────────────────────────────
    onError: (err, { taskId }, ctx) => {
      // Restore the previous state
      if (ctx?.previous) {
        qc.setQueryData(QK.tasks(groupId), ctx.previous);
      }

      const message =
        (err as { message?: string }).message ?? "Could not complete task";
      addToast({ emoji: "❌", title: message, type: "error" });
    },

    // ── Settle: sync with server reality ──────────────────────────────────
    onSettled: () => {
      qc.invalidateQueries({ queryKey: QK.tasks(groupId) });
    },

    onSuccess: (completion) => {
      addToast({ emoji: "✅", title: "Task complete!", sub: "Your group has been notified" });
    },
  });
}

export function useEmergencyReset(groupId: string) {
  const qc = useQueryClient();
  const { addToast } = useToastStore.getState();
  return useMutation({
    mutationFn: (taskId: string) => taskApi.emergencyReset(groupId, taskId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.tasks(groupId) });
      addToast({ emoji: "🔄", title: "Task reset" });
    },
  });
}

// ─── Notifications ────────────────────────────────────────────────────────────

export function useNotifications(unreadOnly = false) {
  return useQuery({
    queryKey: [...QK.notifications, unreadOnly],
    queryFn: () => notificationApi.list({ unread_only: unreadOnly, limit: 50 }),
    staleTime: 5_000,
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: QK.unreadCount,
    queryFn: notificationApi.unreadCount,
    refetchInterval: 30_000,  // poll every 30s as a fallback to WebSocket
    staleTime: 5_000,
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => notificationApi.markRead(ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.notifications });
      qc.invalidateQueries({ queryKey: QK.unreadCount });
    },
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: notificationApi.markAllRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.notifications });
      qc.invalidateQueries({ queryKey: QK.unreadCount });
    },
  });
}
