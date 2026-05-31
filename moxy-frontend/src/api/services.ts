// src/api/services.ts
// Typed API functions — one per endpoint.
// Used by TanStack Query hooks (never called directly from components).

import { apiClient } from "./client";
import type {
  ActivityLogRead,
  FriendRequestRead,
  GroupCreate,
  GroupMemberRead,
  GroupRead,
  NotificationRead,
  TaskCompletionRead,
  TaskCreate,
  TaskRead,
  UserPublic,
  UserRead,
  UserSettings,
} from "@/types";

// ─── Users ────────────────────────────────────────────────────────────────────

export const userApi = {
  me: () => apiClient.get<UserRead>("/users/me").then((r) => r.data),

  updateMe: (data: Partial<Pick<UserRead, "full_name" | "username"> & { avatar_url: string }>) =>
    apiClient.patch<UserRead>("/users/me", data).then((r) => r.data),

  search: (q: string) =>
    apiClient.get<UserPublic[]>("/users/search", { params: { q } }).then((r) => r.data),

  friends: () =>
    apiClient.get<UserPublic[]>("/users/friends").then((r) => r.data),

  sendFriendRequest: (receiver_id: string, message?: string) =>
    apiClient.post<FriendRequestRead>("/users/friends/requests", { receiver_id, message }).then((r) => r.data),

  respondToFriendRequest: (request_id: string, action: "accept" | "reject" | "block") =>
    apiClient.patch<FriendRequestRead>(`/users/friends/requests/${request_id}`, { action }).then((r) => r.data),
};

// ─── Groups ───────────────────────────────────────────────────────────────────

export const groupApi = {
  list: () =>
    apiClient.get<GroupRead[]>("/groups").then((r) => r.data),

  get: (id: string) =>
    apiClient.get<GroupRead>(`/groups/${id}`).then((r) => r.data),

  create: (data: GroupCreate) =>
    apiClient.post<GroupRead>("/groups", data).then((r) => r.data),

  update: (id: string, data: Partial<GroupCreate & { vacation_mode: boolean }>) =>
    apiClient.patch<GroupRead>(`/groups/${id}`, data).then((r) => r.data),

  members: (id: string) =>
    apiClient.get<GroupMemberRead[]>(`/groups/${id}/members`).then((r) => r.data),

  invite: (groupId: string, userId: string) =>
    apiClient.post(`/groups/${groupId}/members`, { user_id: userId }),

  removeMember: (groupId: string, userId: string) =>
    apiClient.delete(`/groups/${groupId}/members/${userId}`),

  updateRole: (groupId: string, userId: string, role: "admin" | "member") =>
    apiClient.patch(`/groups/${groupId}/members/${userId}/role`, { role }),

  joinByInvite: (code: string) =>
    apiClient.post<GroupRead>(`/groups/join/${code}`).then((r) => r.data),

  regenerateInvite: (groupId: string) =>
    apiClient.post<{ invite_code: string }>(`/groups/${groupId}/invite-code/regenerate`).then((r) => r.data),
};

// ─── Tasks ────────────────────────────────────────────────────────────────────

export const taskApi = {
  list: (groupId: string) =>
    apiClient.get<TaskRead[]>(`/groups/${groupId}/tasks`).then((r) => r.data),

  get: (groupId: string, taskId: string) =>
    apiClient.get<TaskRead>(`/groups/${groupId}/tasks/${taskId}`).then((r) => r.data),

  create: (groupId: string, data: TaskCreate) =>
    apiClient.post<TaskRead>(`/groups/${groupId}/tasks`, data).then((r) => r.data),

  update: (groupId: string, taskId: string, data: Partial<TaskCreate>) =>
    apiClient.patch<TaskRead>(`/groups/${groupId}/tasks/${taskId}`, data).then((r) => r.data),

  delete: (groupId: string, taskId: string) =>
    apiClient.delete(`/groups/${groupId}/tasks/${taskId}`),

  /**
   * THE critical endpoint.
   * Uses optimistic update pattern — UI updates immediately,
   * rolls back on API error (409 = already completed by someone else).
   */
  complete: (groupId: string, taskId: string, note?: string) =>
    apiClient
      .post<TaskCompletionRead>(`/groups/${groupId}/tasks/${taskId}/complete`, { note })
      .then((r) => r.data),

  emergencyReset: (groupId: string, taskId: string) =>
    apiClient.post<TaskRead>(`/groups/${groupId}/tasks/${taskId}/reset`).then((r) => r.data),
};

// ─── Notifications ────────────────────────────────────────────────────────────

export const notificationApi = {
  list: (params?: { unread_only?: boolean; limit?: number; offset?: number }) =>
    apiClient.get<NotificationRead[]>("/notifications", { params }).then((r) => r.data),

  unreadCount: () =>
    apiClient.get<{ count: number }>("/notifications/unread-count").then((r) => r.data.count),

  markRead: (ids: string[]) =>
    apiClient.post("/notifications/mark-read", { notification_ids: ids }),

  markAllRead: () =>
    apiClient.post("/notifications/mark-all-read"),
};

// ─── Activity ─────────────────────────────────────────────────────────────────
// Note: activity endpoint not yet in router — add when needed.
// export const activityApi = { ... }
