"""
app/schemas/schemas.py
Pydantic v2 request/response schemas.
Kept in one file for discoverability — split by domain as the project grows.
"""
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator


# ─── Shared ───────────────────────────────────────────────────────────────────

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
        if v and not v.replace("_", "").replace("-", "").isalnum():
            raise ValueError("Username may only contain letters, numbers, _ and -")
        return v


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


class UserUpdateRequest(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    username: Optional[str] = Field(default=None, min_length=3, max_length=64)
    avatar_url: Optional[str] = None


# ─── Friend Requests ──────────────────────────────────────────────────────────

class FriendRequestCreate(BaseModel):
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


class FriendRequestAction(BaseModel):
    action: str = Field(pattern="^(accept|reject|block)$")


# ─── Groups ───────────────────────────────────────────────────────────────────

class GroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=500)
    icon: str = Field(default="🏠", max_length=10)
    color: str = Field(default="#7C6FFF", pattern=r"^#[0-9A-Fa-f]{6}$")
    is_private: bool = False


class GroupUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=120)
    description: Optional[str] = Field(default=None, max_length=500)
    icon: Optional[str] = Field(default=None, max_length=10)
    color: Optional[str] = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    vacation_mode: Optional[bool] = None


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

    model_config = {"from_attributes": True}


class InviteMemberRequest(BaseModel):
    user_id: uuid.UUID


class UpdateMemberRoleRequest(BaseModel):
    role: str = Field(pattern="^(admin|member)$")


# ─── Tasks ────────────────────────────────────────────────────────────────────

class RecurrenceRuleCreate(BaseModel):
    recurrence_type: str = Field(pattern="^(minutes|hourly|daily|weekly|monthly|custom)$")
    interval_value: Optional[int] = Field(default=None, ge=1, le=9999)
    cron_expression: Optional[str] = Field(default=None, max_length=100)
    timezone: str = Field(default="UTC", max_length=60)
    cooldown_minutes: int = Field(default=0, ge=0)

    @field_validator("cron_expression")
    @classmethod
    def validate_cron(cls, v: Optional[str], info) -> Optional[str]:
        if info.data.get("recurrence_type") == "custom" and not v:
            raise ValueError("cron_expression required for custom recurrence type")
        return v


class RecurrenceRuleRead(BaseModel):
    recurrence_type: str
    interval_value: Optional[int]
    cron_expression: Optional[str]
    timezone: str
    cooldown_minutes: int
    next_reset_at: Optional[datetime]

    model_config = {"from_attributes": True}


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)
    emoji: str = Field(default="✅", max_length=10)
    category: Optional[str] = Field(default=None, max_length=60)
    priority: str = Field(default="medium", pattern="^(low|medium|high)$")
    tags: List[str] = Field(default_factory=list, max_length=10)
    assigned_member_ids: List[uuid.UUID] = Field(default_factory=list)
    recurrence: RecurrenceRuleCreate


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=200)
    description: Optional[str] = None
    emoji: Optional[str] = Field(default=None, max_length=10)
    category: Optional[str] = None
    priority: Optional[str] = Field(default=None, pattern="^(low|medium|high)$")
    tags: Optional[List[str]] = None
    is_pinned: Optional[bool] = None
    assigned_member_ids: Optional[List[uuid.UUID]] = None


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


class TaskCompleteRequest(BaseModel):
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


class NotificationMarkRead(BaseModel):
    notification_ids: List[uuid.UUID] = Field(max_length=100)


# ─── Activity ─────────────────────────────────────────────────────────────────

class ActivityLogRead(BaseModel):
    id: uuid.UUID
    group_id: uuid.UUID
    user_id: uuid.UUID
    task_id: Optional[uuid.UUID]
    event_type: str
    event_data: Optional[Dict[str, Any]]
    occurred_at: datetime

    model_config = {"from_attributes": True}


# ─── User Settings ────────────────────────────────────────────────────────────

class UserSettingsUpdate(BaseModel):
    theme: Optional[str] = Field(default=None, pattern="^(dark|light|system)$")
    notification_sound: Optional[str] = Field(default=None, max_length=60)
    email_notifications: Optional[bool] = None
    push_notifications: Optional[bool] = None
    timezone: Optional[str] = Field(default=None, max_length=60)
    vacation_mode: Optional[bool] = None


class DeviceTokenRegister(BaseModel):
    token: str = Field(max_length=512)
    platform: str = Field(pattern="^(ios|android|web)$")
