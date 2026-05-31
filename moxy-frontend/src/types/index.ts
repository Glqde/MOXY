// src/types/index.ts
// All TypeScript types — mirrors the Pydantic schemas from the backend.

export type Priority = "low" | "medium" | "high";
export type GroupRole = "admin" | "member";
export type RecurrenceType = "minutes" | "hourly" | "daily" | "weekly" | "monthly" | "custom";
export type NotificationType =
  | "task_completed"
  | "task_reminder"
  | "task_overdue"
  | "task_reset"
  | "group_invite"
  | "friend_request"
  | "friend_accepted"
  | "system";

// ─── Users ───────────────────────────────────────────────────────────────────

export interface UserPublic {
  id: string;
  full_name: string;
  avatar_url: string | null;
  username: string | null;
}

export interface UserRead extends UserPublic {
  email: string;
  is_active: boolean;
  last_seen_at: string | null;
  created_at: string;
}

export interface UserSettings {
  theme: "dark" | "light" | "system";
  notification_sound: string;
  email_notifications: boolean;
  push_notifications: boolean;
  timezone: string;
  vacation_mode: boolean;
}

// ─── Groups ──────────────────────────────────────────────────────────────────

export interface GroupRead {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  is_private: boolean;
  vacation_mode: boolean;
  invite_code: string | null;
  member_count: number;
  created_at: string;
}

export interface GroupMemberRead {
  user: UserPublic;
  role: GroupRole;
  joined_at: string;
  notification_muted: boolean;
  online?: boolean; // injected client-side from presence data
}

export interface GroupCreate {
  name: string;
  description?: string;
  icon: string;
  color: string;
  is_private: boolean;
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

export interface RecurrenceRuleRead {
  recurrence_type: RecurrenceType;
  interval_value: number | null;
  cron_expression: string | null;
  timezone: string;
  cooldown_minutes: number;
  next_reset_at: string | null;
}

export interface TaskCompletionRead {
  id: string;
  task_id: string;
  completed_by_user: UserPublic;
  completed_at: string;
  period_start: string;
  note: string | null;
}

export interface TaskRead {
  id: string;
  group_id: string;
  title: string;
  description: string | null;
  emoji: string;
  category: string | null;
  priority: Priority;
  tags: string[];
  is_pinned: boolean;
  is_active: boolean;
  is_completed_this_period: boolean;
  completion_streak: number;
  times_completed_total: number;
  current_period_start: string | null;
  current_period_end: string | null;
  recurrence_rule: RecurrenceRuleRead | null;
  latest_completion: TaskCompletionRead | null;
  created_at: string;
}

export interface TaskCreate {
  title: string;
  description?: string;
  emoji: string;
  category?: string;
  priority: Priority;
  tags: string[];
  assigned_member_ids: string[];
  recurrence: {
    recurrence_type: RecurrenceType;
    interval_value?: number;
    cron_expression?: string;
    timezone: string;
    cooldown_minutes: number;
  };
}

// ─── Notifications ────────────────────────────────────────────────────────────

export interface NotificationRead {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  is_read: boolean;
  group_id: string | null;
  task_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ─── Activity ─────────────────────────────────────────────────────────────────

export interface ActivityLogRead {
  id: string;
  group_id: string;
  user_id: string;
  task_id: string | null;
  event_type: string;
  event_data: Record<string, unknown>;
  occurred_at: string;
}

// ─── WebSocket Events (Redis → client) ───────────────────────────────────────

export interface WsTaskCompleted {
  event: "task_completed";
  task_id: string;
  task_title: string;
  task_emoji: string;
  completed_by_id: string;
  completed_by_name: string;
  completed_at: string;
  group_id: string;
}

export interface WsTaskReset {
  event: "task_reset";
  task_id: string;
  task_title: string;
  task_emoji: string;
  next_due: string | null;
  group_id: string;
}

export interface WsMemberPresence {
  event: "member_presence";
  user_id: string;
  online: boolean;
}

export type WsEvent = WsTaskCompleted | WsTaskReset | WsMemberPresence;

// ─── Friend requests ─────────────────────────────────────────────────────────

export interface FriendRequestRead {
  id: string;
  sender: UserPublic;
  receiver: UserPublic;
  status: string;
  message: string | null;
  created_at: string;
}
