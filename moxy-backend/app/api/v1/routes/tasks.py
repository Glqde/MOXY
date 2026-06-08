"""
app/api/v1/routes/tasks.py
Task CRUD + completion endpoint.
"""
import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.redis import get_redis
from app.db.session import get_db
from app.models.models import User
from app.schemas.schemas import TaskCreate, TaskCompleteRequest, TaskCompletionRead, TaskRead, TaskUpdate
from app.services.group_service import GroupService
from app.services.task_service import TaskService

router = APIRouter(prefix="/groups/{group_id}/tasks", tags=["tasks"])


async def _require_member(group_id: uuid.UUID, current_user: User, db: AsyncSession):
    group_svc = GroupService(db)
    membership = await group_svc.get_membership(group_id, current_user.id)
    if not membership:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You are not a member of this group")
    return membership


@router.get("/", response_model=List[TaskRead])
async def list_tasks(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_member(group_id, current_user, db)
    svc = TaskService(db)
    return await svc.get_group_tasks(group_id)


@router.post("/", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
async def create_task(
    group_id: uuid.UUID,
    payload: TaskCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_member(group_id, current_user, db)
    svc = TaskService(db)
    return await svc.create(group_id=group_id, created_by=current_user.id, data=payload)


@router.get("/{task_id}", response_model=TaskRead)
async def get_task(
    group_id: uuid.UUID,
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_member(group_id, current_user, db)
    svc = TaskService(db)
    task = await svc.get_by_id(task_id, load_relations=True)
    if not task or task.group_id != group_id:
        raise HTTPException(404, "Task not found")
    return task


@router.patch("/{task_id}", response_model=TaskRead)
async def update_task(
    group_id: uuid.UUID,
    task_id: uuid.UUID,
    payload: TaskUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    membership = await _require_member(group_id, current_user, db)
    if membership.role != "admin":
        raise HTTPException(403, "Only admins can edit tasks")
    svc = TaskService(db)
    task = await svc.update(task_id, payload)
    if not task:
        raise HTTPException(404, "Task not found")
    return await svc.get_by_id(task.id, load_relations=True)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    group_id: uuid.UUID,
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    membership = await _require_member(group_id, current_user, db)
    if membership.role != "admin":
        raise HTTPException(403, "Only admins can delete tasks")
    svc = TaskService(db)
    if not await svc.delete(task_id):
        raise HTTPException(404, "Task not found")


@router.post("/{task_id}/complete", response_model=TaskCompletionRead, status_code=status.HTTP_201_CREATED)
async def complete_task(
    group_id: uuid.UUID,
    task_id: uuid.UUID,
    payload: TaskCompleteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    redis=Depends(get_redis),
):
    await _require_member(group_id, current_user, db)
    svc = TaskService(db=db, redis=redis)
    completion = await svc.complete_task(
        task_id=task_id,
        user_id=current_user.id,
        note=payload.note,
    )
    # Reload with user relation so FastAPI can serialize it
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from app.models.models import TaskCompletion
    result = await db.execute(
        select(TaskCompletion)
        .where(TaskCompletion.id == completion.id)
        .options(selectinload(TaskCompletion.completed_by_user))
    )
    return result.scalar_one()


@router.post("/{task_id}/reset", response_model=TaskRead)
async def emergency_reset_task(
    group_id: uuid.UUID,
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    redis=Depends(get_redis),
):
    """Admin override: manually reset a task (vacation mode, error recovery)."""
    membership = await _require_member(group_id, current_user, db)
    if membership.role != "admin":
        raise HTTPException(403, "Only admins can force-reset tasks")
    svc = TaskService(db=db, redis=redis)
    return await svc.reset_task(task_id)
