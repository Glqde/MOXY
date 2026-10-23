"""
app/api/v1/routes/tasks.py
Task CRUD + completion endpoint.
Every task lookup is scoped to the {group_id} in the path.
"""
import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.db.session import get_db
from app.models.models import GroupMember, User
from app.schemas.schemas import TaskCreate, TaskCompleteRequest, TaskCompletionRead, TaskRead, TaskUpdate
from app.services.group_service import GroupService
from app.services.task_service import TaskService

router = APIRouter(prefix="/groups/{group_id}/tasks", tags=["tasks"])


async def _require_member(group_id: uuid.UUID, current_user: User, db: AsyncSession) -> GroupMember:
    membership = await GroupService(db).get_membership(group_id, current_user.id)
    if not membership:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You are not a member of this group")
    return membership


async def _require_admin(group_id: uuid.UUID, current_user: User, db: AsyncSession, action: str) -> None:
    membership = await _require_member(group_id, current_user, db)
    if membership.role != "admin":
        raise HTTPException(403, f"Only admins can {action}")


@router.get("", response_model=List[TaskRead])
async def list_tasks(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_member(group_id, current_user, db)
    return await TaskService(db).get_group_tasks(group_id)


@router.post("", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
async def create_task(
    group_id: uuid.UUID,
    payload: TaskCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_member(group_id, current_user, db)
    return await TaskService(db).create(group_id=group_id, created_by=current_user.id, data=payload)


@router.get("/{task_id}", response_model=TaskRead)
async def get_task(
    group_id: uuid.UUID,
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_member(group_id, current_user, db)
    task = await TaskService(db).get_for_read(task_id, group_id)
    if not task:
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
    await _require_admin(group_id, current_user, db, "edit tasks")
    task = await TaskService(db).update(task_id, group_id, payload)
    if not task:
        raise HTTPException(404, "Task not found")
    return task


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    group_id: uuid.UUID,
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_admin(group_id, current_user, db, "delete tasks")
    if not await TaskService(db).delete(task_id, group_id):
        raise HTTPException(404, "Task not found")


@router.post("/{task_id}/complete", response_model=TaskCompletionRead, status_code=status.HTTP_201_CREATED)
async def complete_task(
    group_id: uuid.UUID,
    task_id: uuid.UUID,
    payload: TaskCompleteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # complete_task checks membership itself (after locking the task row)
    return await TaskService(db).complete_task(
        task_id=task_id,
        user=current_user,
        group_id=group_id,
        note=payload.note,
    )


@router.delete("/{task_id}/complete", response_model=TaskRead)
async def undo_complete_task(
    group_id: uuid.UUID,
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Undo the current period's completion. Only the completer can undo it."""
    return await TaskService(db).undo_complete_task(
        task_id=task_id,
        user=current_user,
        group_id=group_id,
    )


@router.post("/{task_id}/reset", response_model=TaskRead)
async def emergency_reset_task(
    group_id: uuid.UUID,
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admin override: manually reset a task (vacation mode, error recovery)."""
    await _require_admin(group_id, current_user, db, "force-reset tasks")
    task = await TaskService(db).reset_task(task_id, group_id)
    if not task:
        raise HTTPException(404, "Task not found")
    return task
