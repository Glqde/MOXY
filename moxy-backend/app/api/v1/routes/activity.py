"""
app/api/v1/routes/activity.py
Activity feed across the current user's groups (or a single group).
"""
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_current_user
from app.db.session import get_db
from app.models.models import ActivityLog, GroupMember, User
from app.schemas.schemas import ActivityLogRead

router = APIRouter(prefix="/activity", tags=["activity"])


@router.get("", response_model=List[ActivityLogRead])
async def list_activity(
    group_id: Optional[uuid.UUID] = Query(None),
    before: Optional[datetime] = Query(None, description="Cursor: occurred_at of the last item seen"),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    my_groups = select(GroupMember.group_id).where(GroupMember.user_id == current_user.id)
    q = (
        select(ActivityLog)
        .where(ActivityLog.group_id.in_(my_groups))
        .options(selectinload(ActivityLog.user))
        .order_by(ActivityLog.occurred_at.desc())
        .limit(limit)
    )
    if group_id is not None:
        q = q.where(ActivityLog.group_id == group_id)
    if before is not None:
        q = q.where(ActivityLog.occurred_at < before)
    result = await db.execute(q)
    return list(result.scalars().all())
