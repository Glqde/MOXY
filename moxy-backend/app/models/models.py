"""
app/models/models.py
Complete ORM model definitions for MOXY.

Table overview:
  users               — Supabase Auth users mirrored locally
  friendships         — bidirectional confirmed friendships
  friend_requests     — pending/rejected requests
  groups              — shared task groups
  group_members       — group membership + roles
  tasks               — shared recurring tasks
  recurrence_rules    — cron/interval based reset rules
  task_completions    — one row per completion per recurrence window
  notifications       — in-app notification inbox
  activity_logs       — immutable audit trail
  device_tokens       — push notification tokens
  user_settings       — per-user preferences
"""
import uuid
from datetime import datetime
from enum import Enum as PyEnum
from typing import List, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin, utcnow


# ─── Enums ────────────────────────────────────────────────────────────────────

class FriendRequestStatus(str, PyEnum):
    pending = "pending"
    accepted = "accepted"
    rejected = "rejected"
    blocked = "blocked"


class GroupRole(str, PyEnum):
    admin = "admin"
    member = "member"


class TaskPriority(str, PyEnum):
    low = "low"
    medium = "medium"
    high = "high"


class RecurrenceType(str, PyEnum):
    minutes = "minutes"
    hourly = "hourly"
    daily = "daily"
    weekly = "weekly"
    monthly = "monthly"
    custom = "custom"   # raw cron expression


class NotificationType(str, PyEnum):
    task_completed = "task_completed"
    task_reminder = "task_reminder"
    task_overdue = "task_overdue"
    task_reset = "task_reset"
    group_invite = "group_invite"
    friend_request = "friend_request"
    friend_accepted = "friend_accepted"
    system = "system"


# ─── User ─────────────────────────────────────────────────────────────────────

class User(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, index=True
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(512))
    username: Mapped[Optional[str]] = mapped_column(String(64), unique=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_seen_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    sent_friend_requests: Mapped[List["FriendRequest"]] = relationship(
        "FriendRequest", foreign_keys="FriendRequest.sender_id", back_populates="sender"
    )
    received_friend_requests: Mapped[List["FriendRequest"]] = relationship(
        "FriendRequest", foreign_keys="FriendRequest.receiver_id", back_populates="receiver"
    )
    group_memberships: Mapped[List["GroupMember"]] = relationship(
        "GroupMember", back_populates="user"
    )
    task_completions: Mapped[List["TaskCompletion"]] = relationship(
        "TaskCompletion", back_populates="completed_by_user"
    )
    notifications: Mapped[List["Notification"]] = relationship(
        "Notification",
        foreign_keys="Notification.user_id",
        back_populates="user",
        order_by="Notification.created_at.desc()"
    )
    settings: Mapped[Optional["UserSettings"]] = relationship(
        "UserSettings", back_populates="user", uselist=False
    )


# ─── Friendships ──────────────────────────────────────────────────────────────

class FriendRequest(UUIDMixin, TimestampMixin, Base):
    """
    Directional friend request. On acceptance, a Friendship row is created.
    Blocking is stored here as status=blocked (blocker is sender).
    """
    __tablename__ = "friend_requests"

    sender_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    receiver_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[FriendRequestStatus] = mapped_column(
        String(20), default=FriendRequestStatus.pending, nullable=False
    )
    message: Mapped[Optional[str]] = mapped_column(String(280))

    sender: Mapped["User"] = relationship("User", foreign_keys=[sender_id], back_populates="sent_friend_requests")
    receiver: Mapped["User"] = relationship("User", foreign_keys=[receiver_id], back_populates="received_friend_requests")

    __table_args__ = (
        UniqueConstraint("sender_id", "receiver_id", name="uq_friend_request"),
        Index("ix_friend_requests_receiver_status", "receiver_id", "status"),
    )


class Friendship(UUIDMixin, TimestampMixin, Base):
    """
    Confirmed bidirectional friendship.
    Always stored with user_id_1 < user_id_2 (lexicographic) to prevent duplicates.
    """
    __tablename__ = "friendships"

    user_id_1: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    user_id_2: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id_1", "user_id_2", name="uq_friendship"),
        Index("ix_friendship_user1", "user_id_1"),
        Index("ix_friendship_user2", "user_id_2"),
    )


# ─── Groups ───────────────────────────────────────────────────────────────────

class Group(UUIDMixin, TimestampMixin, Base):
    """Shared task group (household, team, etc.)."""
    __tablename__ = "groups"

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(500))
    icon: Mapped[str] = mapped_column(String(10), default="🏠")      # emoji
    color: Mapped[str] = mapped_column(String(7), default="#7C6FFF")  # hex
    is_private: Mapped[bool] = mapped_column(Boolean, default=False)
    invite_code: Mapped[Optional[str]] = mapped_column(String(12), unique=True, index=True)
    vacation_mode: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    members: Mapped[List["GroupMember"]] = relationship("GroupMember", back_populates="group", cascade="all, delete-orphan")
    tasks: Mapped[List["Task"]] = relationship("Task", back_populates="group", cascade="all, delete-orphan")


class GroupMember(UUIDMixin, TimestampMixin, Base):
    """Join table for group membership with role."""
    __tablename__ = "group_members"

    group_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("groups.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[GroupRole] = mapped_column(String(20), default=GroupRole.member, nullable=False)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    notification_muted: Mapped[bool] = mapped_column(Boolean, default=False)

    group: Mapped["Group"] = relationship("Group", back_populates="members")
    user: Mapped["User"] = relationship("User", back_populates="group_memberships")

    __table_args__ = (
        UniqueConstraint("group_id", "user_id", name="uq_group_member"),
        Index("ix_group_members_user", "user_id"),
    )


# ─── Tasks ────────────────────────────────────────────────────────────────────

class Task(UUIDMixin, TimestampMixin, Base):
    """
    A shared recurring task owned by a group.
    Any group member can complete it; completion locks it for the current period.
    """
    __tablename__ = "tasks"

    group_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    emoji: Mapped[str] = mapped_column(String(10), default="✅")
    category: Mapped[Optional[str]] = mapped_column(String(60))
    priority: Mapped[TaskPriority] = mapped_column(String(10), default=TaskPriority.medium, nullable=False)
    tags: Mapped[Optional[dict]] = mapped_column(JSONB, default=list)  # ["chores", "weekly"]
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Assigned members (optional — empty means anyone can complete)
    assigned_member_ids: Mapped[Optional[dict]] = mapped_column(JSONB, default=list)

    # Current period state — reset by Celery after each recurrence
    current_period_start: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    current_period_end: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    is_completed_this_period: Mapped[bool] = mapped_column(Boolean, default=False)
    completion_streak: Mapped[int] = mapped_column(Integer, default=0)
    times_completed_total: Mapped[int] = mapped_column(Integer, default=0)

    group: Mapped["Group"] = relationship("Group", back_populates="tasks")
    recurrence_rule: Mapped[Optional["RecurrenceRule"]] = relationship("RecurrenceRule", back_populates="task", uselist=False, cascade="all, delete-orphan")
    completions: Mapped[List["TaskCompletion"]] = relationship("TaskCompletion", back_populates="task", order_by="TaskCompletion.completed_at.desc()")

    __table_args__ = (
        Index("ix_tasks_group_active", "group_id", "is_active"),
        Index("ix_tasks_period", "current_period_end"),  # Celery query to find tasks to reset
    )


class RecurrenceRule(UUIDMixin, TimestampMixin, Base):
    """
    Defines when a task resets.
    Celery Beat queries tasks where next_reset_at <= now() and resets them.
    """
    __tablename__ = "recurrence_rules"

    task_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), unique=True, nullable=False)
    recurrence_type: Mapped[RecurrenceType] = mapped_column(String(20), nullable=False)
    interval_value: Mapped[Optional[int]] = mapped_column(Integer)          # e.g. every 3 (days)
    cron_expression: Mapped[Optional[str]] = mapped_column(String(100))     # for custom type
    timezone: Mapped[str] = mapped_column(String(60), default="UTC")
    cooldown_minutes: Mapped[int] = mapped_column(Integer, default=0)       # min gap between completions
    next_reset_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), index=True)
    snooze_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    task: Mapped["Task"] = relationship("Task", back_populates="recurrence_rule")


# ─── Task Completions ─────────────────────────────────────────────────────────

class TaskCompletion(UUIDMixin, Base):
    """
    Immutable record of a single task completion.

    The UNIQUE constraint on (task_id, period_start) is the database-level
    guarantee against duplicate completions — even if Redis lock fails,
    Postgres will reject a second insert for the same period.

    This is the "last line of defense" in the distributed locking strategy:
      1. Redis SETNX (fast path — prevents double-clicks)
      2. DB unique constraint (slow path — prevents race conditions at DB level)
    """
    __tablename__ = "task_completions"

    task_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    completed_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)  # which recurrence window
    note: Mapped[Optional[str]] = mapped_column(String(500))   # optional completion note

    task: Mapped["Task"] = relationship("Task", back_populates="completions")
    completed_by_user: Mapped["User"] = relationship("User", back_populates="task_completions")

    __table_args__ = (
        # THE critical constraint — prevents any duplicate completion in same period
        UniqueConstraint("task_id", "period_start", name="uq_task_completion_per_period"),
        Index("ix_task_completions_user", "completed_by"),
        Index("ix_task_completions_period", "period_start"),
    )


# ─── Notifications ────────────────────────────────────────────────────────────

class Notification(UUIDMixin, TimestampMixin, Base):
    """Per-user in-app notification inbox."""
    __tablename__ = "notifications"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    type: Mapped[NotificationType] = mapped_column(String(40), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[Optional[str]] = mapped_column(String(500))
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    actor_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))  # who triggered it
    group_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("groups.id", ondelete="SET NULL"))
    task_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="SET NULL"))
    extra_data: Mapped[Optional[dict]] = mapped_column(JSONB, default=dict)  # extra payload for frontend

    user: Mapped["User"] = relationship("User", foreign_keys=[user_id], back_populates="notifications")

    __table_args__ = (
        Index("ix_notifications_user_unread", "user_id", "is_read"),
        Index("ix_notifications_created", "created_at"),
    )


# ─── Activity Log ─────────────────────────────────────────────────────────────

class ActivityLog(UUIDMixin, Base):
    """
    Immutable event log — never updated, only appended.
    Used for the activity feed and analytics.
    """
    __tablename__ = "activity_logs"

    group_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    task_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="SET NULL"))
    event_type: Mapped[str] = mapped_column(String(60), nullable=False)   # "task_completed", "member_joined", etc.
    event_data: Mapped[Optional[dict]] = mapped_column(JSONB, default=dict)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)

    __table_args__ = (
        Index("ix_activity_group_time", "group_id", "occurred_at"),
    )


# ─── Device Tokens ────────────────────────────────────────────────────────────

class DeviceToken(UUIDMixin, TimestampMixin, Base):
    """Push notification tokens (FCM / APNs)."""
    __tablename__ = "device_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token: Mapped[str] = mapped_column(String(512), nullable=False)
    platform: Mapped[str] = mapped_column(String(20))  # "ios", "android", "web"
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    __table_args__ = (UniqueConstraint("user_id", "token", name="uq_device_token"),)


# ─── User Settings ────────────────────────────────────────────────────────────

class UserSettings(UUIDMixin, TimestampMixin, Base):
    """Per-user preferences — one row per user."""
    __tablename__ = "user_settings"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    theme: Mapped[str] = mapped_column(String(10), default="dark")
    notification_sound: Mapped[str] = mapped_column(String(60), default="chime")
    email_notifications: Mapped[bool] = mapped_column(Boolean, default=True)
    push_notifications: Mapped[bool] = mapped_column(Boolean, default=True)
    timezone: Mapped[str] = mapped_column(String(60), default="UTC")
    vacation_mode: Mapped[bool] = mapped_column(Boolean, default=False)

    user: Mapped["User"] = relationship("User", back_populates="settings")
