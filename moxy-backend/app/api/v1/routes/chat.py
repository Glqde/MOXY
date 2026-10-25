"""
app/api/v1/routes/chat.py
Group chat. Messages are saved first, then broadcast to the group's
realtime room, so anyone who reloads sees exactly what was pushed live.
"""
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_current_user
from app.core.realtime import emit_group_event
from app.db.session import get_db
from app.models.models import GroupMember, GroupMessage, MessageKind, User
from app.schemas.schemas import ChatMessageCreate, ChatMessageRead
from app.services.chat_service import message_event, new_message
from app.services.group_service import GroupService

router = APIRouter(tags=["chat"])


async def _require_member(db: AsyncSession, group_id: uuid.UUID, user: User) -> GroupMember:
    membership = await GroupService(db).get_membership(group_id, user.id)
    if not membership:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You are not a member of this group")
    return membership


@router.get("/groups/{group_id}/messages", response_model=List[ChatMessageRead])
async def list_messages(
    group_id: uuid.UUID,
    before: Optional[datetime] = Query(None, description="Cursor: created_at of the oldest message already loaded"),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Newest page first in the query, returned oldest → newest for display."""
    await _require_member(db, group_id, current_user)
    q = (
        select(GroupMessage)
        .where(GroupMessage.group_id == group_id)
        .options(selectinload(GroupMessage.user))
        .order_by(GroupMessage.created_at.desc())
        .limit(limit)
    )
    if before is not None:
        q = q.where(GroupMessage.created_at < before)
    result = await db.execute(q)
    return list(reversed(result.scalars().all()))


@router.post("/groups/{group_id}/messages", response_model=ChatMessageRead, status_code=status.HTTP_201_CREATED)
async def send_message(
    group_id: uuid.UUID,
    payload: ChatMessageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    membership = await _require_member(db, group_id, current_user)
    message = new_message(group_id, current_user, payload.body)
    db.add(message)
    # Your own message is never unread for you
    membership.chat_last_read_at = message.created_at
    await db.commit()
    await emit_group_event(group_id, message_event(message))
    return message


@router.delete("/groups/{group_id}/messages/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_message(
    group_id: uuid.UUID,
    message_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    membership = await _require_member(db, group_id, current_user)
    message = await db.get(GroupMessage, message_id)
    if not message or message.group_id != group_id or message.kind != MessageKind.text:
        raise HTTPException(404, "Message not found")
    # Senders delete their own; admins can delete anything in their group
    if message.user_id != current_user.id and membership.role != "admin":
        raise HTTPException(403, "You can only delete your own messages")
    await db.execute(delete(GroupMessage).where(GroupMessage.id == message_id))
    await db.commit()
    await emit_group_event(group_id, {
        "event": "chat_message_deleted",
        "group_id": str(group_id),
        "message_id": str(message_id),
    })


@router.post("/groups/{group_id}/messages/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_read(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    membership = await _require_member(db, group_id, current_user)
    membership.chat_last_read_at = datetime.now(timezone.utc)


@router.get("/chat/unread", response_model=Dict[str, int])
async def unread_counts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """{group_id: unread message count} for every group the user is in (one query)."""
    result = await db.execute(
        select(GroupMember.group_id, func.count(GroupMessage.id))
        .outerjoin(GroupMessage, and_(
            GroupMessage.group_id == GroupMember.group_id,
            GroupMessage.kind == MessageKind.text,
            or_(GroupMessage.user_id.is_(None), GroupMessage.user_id != current_user.id),
            or_(GroupMember.chat_last_read_at.is_(None), GroupMessage.created_at > GroupMember.chat_last_read_at),
        ))
        .where(GroupMember.user_id == current_user.id)
        .group_by(GroupMember.group_id)
    )
    return {str(gid): count for gid, count in result.all()}
