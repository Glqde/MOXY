"""
app/services/chat_service.py
Shared helpers for group chat messages.
"""
import uuid
from datetime import datetime, timezone

from app.models.models import GroupMessage, MessageKind, User
from app.schemas.schemas import ChatMessageRead


def new_message(group_id: uuid.UUID, user: User, body: str, kind: MessageKind = MessageKind.text) -> GroupMessage:
    message = GroupMessage(
        group_id=group_id,
        user_id=user.id,
        kind=kind,
        body=body,
        created_at=datetime.now(timezone.utc),
    )
    message.user = user  # loaded, so it serializes without a lazy load
    return message


def message_event(message: GroupMessage) -> dict:
    """Realtime payload — same shape as ChatMessageRead."""
    return {"event": "chat_message", **ChatMessageRead.model_validate(message).model_dump(mode="json")}
