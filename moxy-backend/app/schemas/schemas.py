"""
app/schemas/schemas.py
Pydantic v2 request/response schemas.
Kept in one file for discoverability — split by domain as the project grows.
"""
import uuid
import zoneinfo
from datetime import datetime
from typing import Annotated, Any, ClassVar, Dict, List, Optional

from croniter import croniter
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator


# ─── Shared ───────────────────────────────────────────────────────────────────

# Zero-width characters render as nothing, so text made only of them is blank
_INVISIBLE = dict.fromkeys(map(ord, "​‌‍⁠﻿"))


def _strip_null_bytes(value: Any) -> Any:
    if isinstance(value, str):
        return value.replace("\x00", "")
    if isinstance(value, dict):
        return {k: _strip_null_bytes(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_strip_null_bytes(v) for v in value]
    return value


def required_text(value: Optional[str], label: str) -> str:
    """Trims, and rejects null or text that would display as nothing."""
    if value is None or not value.translate(_INVISIBLE).strip():
        raise ValueError(f"{label} can't be empty")
    return value.strip()


def _check_username(value: Optional[str]) -> Optional[str]:
    if value and not value.replace("_", "").replace("-", "").isalnum():
        raise ValueError("Username may only contain letters, numbers, _ and -")
    return value


class RequestModel(BaseModel):
    """Base for request bodies. Postgres rejects NUL characters in text, so
    they're dropped here instead of failing the insert."""

    @model_validator(mode="before")
    @classmethod
    def _drop_null_bytes(cls, data: Any) -> Any:
        return _strip_null_bytes(data)


class UpdateModel(RequestModel):
    """Partial update. Fields named in NOT_NULL may be omitted but not set to null."""
    NOT_NULL: ClassVar[tuple] = ()

    @model_validator(mode="after")
    def _reject_nulls(self):
        for name in self.NOT_NULL:
            if name in self.model_fields_set and getattr(self, name) is None:
                raise ValueError(f"{name} can't be null")
        return self

class APIResponse(BaseModel):
    success: bool = True
    message: str = "ok"
    data: Optional[Any] = None


class PaginatedResponse(BaseModel):
    items: List[Any]
    total: int
    page: int
    page_size: int
    has_next: bool


# ─── User ─────────────────────────────────────────────────────────────────────

class UserBase(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=255)
    avatar_url: Optional[str] = None
    username: Optional[str] = Field(default=None, min_length=3, max_length=64)

    @field_validator("username")
    @classmethod
    def username_alphanumeric(cls, v: Optional[str]) -> Optional[str]:
        return _check_username(v)


class UserCreate(UserBase):
    """Called internally when a Supabase JWT is first seen."""
    id: uuid.UUID   # Supabase auth UUID


class UserRead(UserBase):
    id: uuid.UUID
    is_active: bool
    last_seen_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}


class UserPublic(BaseModel):
    """Stripped-down user for embedding in other responses."""
    id: uuid.UUID
    full_name: str
    avatar_url: Optional[str]
    username: Optional[str]

    model_config = {"from_attributes": True}


class UserUpdateRequest(UpdateModel):
    NOT_NULL = ("full_name",)
    full_name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    username: Optional[str] = Field(default=None, min_length=3, max_length=64)
    avatar_url: Optional[str] = None

    @field_validator("full_name")
    @classmethod
    def name_not_blank(cls, v: Optional[str]) -> Optional[str]:
        return required_text(v, "Name")

    @field_validator("username")
    @classmethod
    def username_alphanumeric(cls, v: Optional[str]) -> Optional[str]:
        return _check_username(v)


# ─── Friend Requests ──────────────────────────────────────────────────────────

class FriendRequestCreate(RequestModel):
    receiver_id: uuid.UUID
    message: Optional[str] = Field(default=None, max_length=280)


class FriendRequestRead(BaseModel):
    id: uuid.UUID
    sender: UserPublic
    receiver: UserPublic
    status: str
    message: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class FriendRequestAction(RequestModel):
    action: str = Field(pattern="^(accept|reject|block)$")


# ─── Groups ───────────────────────────────────────────────────────────────────

class GroupCreate(RequestModel):
    name: str = Field(min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=500)
    icon: str = Field(default="🏠", max_length=10)
    color: str = Field(default="#7C6FFF", pattern=r"^#[0-9A-Fa-f]{6}$")
    is_private: bool = False

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v: str) -> str:
        return required_text(v, "Group name")


class GroupUpdate(UpdateModel):
    NOT_NULL = ("name", "icon", "color", "vacation_mode")
    name: Optional[str] = Field(default=None, max_length=120)
    description: Optional[str] = Field(default=None, max_length=500)
    icon: Optional[str] = Field(default=None, max_length=10)
    color: Optional[str] = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    vacation_mode: Optional[bool] = None

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v: Optional[str]) -> Optional[str]:
        return required_text(v, "Group name")


class GroupRead(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    icon: str
    color: str
    is_private: bool
    vacation_mode: bool
    invite_code: Optional[str]
    member_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class GroupMemberRead(BaseModel):
    user: UserPublic
    role: str
    joined_at: datetime
    notification_muted: bool
    online: bool = False  # live presence from Redis, set by list_members

    model_config = {"from_attributes": True}


class InviteMemberRequest(RequestModel):
    user_id: uuid.UUID


class UpdateMemberRoleRequest(RequestModel):
    role: str = Field(pattern="^(admin|member)$")


# ─── Tasks ────────────────────────────────────────────────────────────────────

class RecurrenceRuleCreate(RequestModel):
    recurrence_type: str = Field(pattern="^(minutes|hourly|daily|weekly|monthly|custom)$")
    interval_value: Optional[int] = Field(default=None, ge=1, le=9999)
    cron_expression: Optional[str] = Field(default=None, max_length=100)
    timezone: str = Field(default="UTC", max_length=60)
    cooldown_minutes: int = Field(default=0, ge=0, le=60 * 24 * 366)

    @field_validator("timezone")
    @classmethod
    def known_timezone(cls, v: str) -> str:
        # Comes from the browser; an unrecognised zone shouldn't block creating
        # the task, so it falls back to UTC
        try:
            zoneinfo.ZoneInfo(v)
            return v
        except (zoneinfo.ZoneInfoNotFoundError, ValueError):
            return "UTC"

    @model_validator(mode="after")
    def valid_schedule(self):
        if self.recurrence_type == "custom":
            if not self.cron_expression:
                raise ValueError("cron_expression required for custom recurrence type")
            if not croniter.is_valid(self.cron_expression):
                raise ValueError("cron_expression isn't a valid cron schedule")
        return self


class RecurrenceRuleRead(BaseModel):
    recurrence_type: str
    interval_value: Optional[int]
    cron_expression: Optional[str]
    timezone: str
    cooldown_minutes: int
    next_reset_at: Optional[datetime]

    model_config = {"from_attributes": True}


Tag = Field(max_length=40)


class TaskCreate(RequestModel):
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)
    emoji: str = Field(default="✅", max_length=10)
    category: Optional[str] = Field(default=None, max_length=60)
    priority: str = Field(default="medium", pattern="^(low|medium|high)$")
    tags: List[Annotated[str, Tag]] = Field(default_factory=list, max_length=10)
    assigned_member_ids: List[uuid.UUID] = Field(default_factory=list)
    recurrence: RecurrenceRuleCreate

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, v: str) -> str:
        return required_text(v, "Title")


class TaskUpdate(UpdateModel):
    NOT_NULL = ("title", "emoji", "priority", "is_pinned")
    title: Optional[str] = Field(default=None, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)
    emoji: Optional[str] = Field(default=None, max_length=10)
    category: Optional[str] = Field(default=None, max_length=60)
    priority: Optional[str] = Field(default=None, pattern="^(low|medium|high)$")
    tags: Optional[List[Annotated[str, Tag]]] = Field(default=None, max_length=10)
    is_pinned: Optional[bool] = None
    assigned_member_ids: Optional[List[uuid.UUID]] = None

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, v: Optional[str]) -> Optional[str]:
        return required_text(v, "Title")


class TaskRead(BaseModel):
    id: uuid.UUID
    group_id: uuid.UUID
    title: str
    description: Optional[str]
    emoji: str
    category: Optional[str]
    priority: str
    tags: Optional[List[str]]
    is_pinned: bool
    is_active: bool
    is_completed_this_period: bool
    completion_streak: int
    times_completed_total: int
    current_period_start: Optional[datetime]
    current_period_end: Optional[datetime]
    recurrence_rule: Optional[RecurrenceRuleRead]
    latest_completion: Optional["TaskCompletionRead"] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class TaskCompleteRequest(RequestModel):
    note: Optional[str] = Field(default=None, max_length=500)


class TaskCompletionRead(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    completed_by_user: UserPublic
    completed_at: datetime
    period_start: datetime
    note: Optional[str]

    model_config = {"from_attributes": True}


# Required for forward ref in TaskRead
TaskRead.model_rebuild()


# ─── Notifications ────────────────────────────────────────────────────────────

class NotificationRead(BaseModel):
    id: uuid.UUID
    type: str
    title: str
    body: Optional[str]
    is_read: bool
    group_id: Optional[uuid.UUID]
    task_id: Optional[uuid.UUID]
    extra_data: Optional[Dict[str, Any]]
    created_at: datetime

    model_config = {"from_attributes": True}


class NotificationMarkRead(RequestModel):
    notification_ids: List[uuid.UUID] = Field(max_length=100)


# ─── Group Chat ───────────────────────────────────────────────────────────────

class ChatMessageCreate(RequestModel):
    body: str = Field(min_length=1, max_length=2000)

    @field_validator("body")
    @classmethod
    def not_blank(cls, v: str) -> str:
        return required_text(v, "Message")


class ChatMessageRead(BaseModel):
    id: uuid.UUID
    group_id: uuid.UUID
    kind: str
    body: str
    created_at: datetime
    user: Optional[UserPublic] = None

    model_config = {"from_attributes": True}


# ─── Activity ─────────────────────────────────────────────────────────────────

class ActivityLogRead(BaseModel):
    id: uuid.UUID
    group_id: uuid.UUID
    user_id: uuid.UUID
    user: Optional[UserPublic] = None
    task_id: Optional[uuid.UUID]
    event_type: str
    event_data: Optional[Dict[str, Any]]
    occurred_at: datetime

    model_config = {"from_attributes": True}


# ─── User Settings ────────────────────────────────────────────────────────────

class UserSettingsUpdate(RequestModel):
    theme: Optional[str] = Field(default=None, pattern="^(dark|light|system)$")
    notification_sound: Optional[str] = Field(default=None, max_length=60)
    email_notifications: Optional[bool] = None
    push_notifications: Optional[bool] = None
    timezone: Optional[str] = Field(default=None, max_length=60)
    vacation_mode: Optional[bool] = None


class DeviceTokenRegister(RequestModel):
    token: str = Field(max_length=512)
    platform: str = Field(pattern="^(ios|android|web)$")
