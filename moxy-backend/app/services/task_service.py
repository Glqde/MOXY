"""
app/services/task_service.py
Task domain logic — the most critical service in MOXY.

Completion guarantee flow:
  1. SELECT ... FOR UPDATE on the task row — concurrent completions of the
     same task queue up here; the loser sees is_completed_this_period and 409s
  2. DB unique constraint on (task_id, period_start) — last line of defense
  3. Activity log + notifications written in the same transaction
  4. Commit, THEN broadcast the realtime event, so clients that refetch on
     the event always see the committed state
"""
import uuid
from datetime import datetime, timezone
from typing import Iterable, List, Optional

import structlog
from fastapi import HTTPException
from sqlalchemy import and_, select, tuple_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.realtime import emit_group_event
from app.services.chat_service import message_event, new_message
from app.models.models import (
    ActivityLog,
    GroupMember,
    MessageKind,
    Notification,
    NotificationType,
    RecurrenceRule,
    Task,
    TaskCompletion,
    User,
)
from app.schemas.schemas import TaskCreate, TaskUpdate
from app.utils.recurrence import calculate_next_reset, calculate_period

logger = structlog.get_logger(__name__)

# Upper bound on tasks reset per scheduler tick; the rest go next tick
RESET_BATCH_SIZE = 500


def _shorten(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


class TaskService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── Read ──────────────────────────────────────────────────────────────────

    def _task_query(self, task_id: uuid.UUID, group_id: Optional[uuid.UUID]):
        q = select(Task).where(Task.id == task_id).options(selectinload(Task.recurrence_rule))
        if group_id is not None:
            # Scoping by group in SQL is what stops an admin of one group
            # from touching another group's tasks by ID
            q = q.where(Task.group_id == group_id)
        return q

    async def get_by_id(
        self,
        task_id: uuid.UUID,
        group_id: Optional[uuid.UUID] = None,
        *,
        for_update: bool = False,
    ) -> Optional[Task]:
        q = self._task_query(task_id, group_id)
        if for_update:
            q = q.with_for_update(of=Task).execution_options(populate_existing=True)
        result = await self.db.execute(q)
        return result.scalar_one_or_none()

    async def get_for_read(self, task_id: uuid.UUID, group_id: uuid.UUID) -> Optional[Task]:
        task = await self.get_by_id(task_id, group_id)
        if task:
            await self._attach_latest_completions([task])
        return task

    async def get_group_tasks(self, group_id: uuid.UUID) -> List[Task]:
        result = await self.db.execute(
            select(Task)
            .where(and_(Task.group_id == group_id, Task.is_active == True))  # noqa: E712
            .options(selectinload(Task.recurrence_rule))
            .order_by(Task.is_pinned.desc(), Task.created_at.asc())
        )
        tasks = list(result.scalars().all())
        await self._attach_latest_completions(tasks)
        return tasks

    async def _attach_latest_completions(self, tasks: Iterable[Task]) -> None:
        """
        Sets task.latest_completion for the current period in ONE query.
        The (task_id, period_start) unique index means at most one row per task,
        so this never scans a task's completion history.
        """
        tasks = list(tasks)
        for t in tasks:
            t.latest_completion = None
        keys = [
            (t.id, t.current_period_start)
            for t in tasks
            if t.is_completed_this_period and t.current_period_start
        ]
        if not keys:
            return
        result = await self.db.execute(
            select(TaskCompletion)
            .where(tuple_(TaskCompletion.task_id, TaskCompletion.period_start).in_(keys))
            .options(selectinload(TaskCompletion.completed_by_user))
        )
        by_task = {c.task_id: c for c in result.scalars().all()}
        for t in tasks:
            t.latest_completion = by_task.get(t.id)

    # ── Create / Update / Delete ───────────────────────────────────────────────

    async def create(self, group_id: uuid.UUID, created_by: uuid.UUID, data: TaskCreate) -> Task:
        period_start, period_end = calculate_period(
            data.recurrence.recurrence_type,
            data.recurrence.interval_value,
        )
        next_reset = calculate_next_reset(
            data.recurrence.recurrence_type,
            data.recurrence.interval_value,
            data.recurrence.cron_expression,
            data.recurrence.timezone,
        )

        task = Task(
            group_id=group_id,
            created_by=created_by,
            title=data.title,
            description=data.description,
            emoji=data.emoji,
            category=data.category,
            priority=data.priority,
            tags=data.tags,
            assigned_member_ids=[str(uid) for uid in data.assigned_member_ids],
            current_period_start=period_start,
            current_period_end=period_end or next_reset,
            recurrence_rule=RecurrenceRule(
                recurrence_type=data.recurrence.recurrence_type,
                interval_value=data.recurrence.interval_value,
                cron_expression=data.recurrence.cron_expression,
                timezone=data.recurrence.timezone,
                cooldown_minutes=data.recurrence.cooldown_minutes,
                next_reset_at=next_reset,
            ),
        )
        self.db.add(task)
        await self.db.flush()
        task.latest_completion = None
        return task

    async def update(self, task_id: uuid.UUID, group_id: uuid.UUID, data: TaskUpdate) -> Optional[Task]:
        task = await self.get_by_id(task_id, group_id)
        if not task or not task.is_active:
            return None
        update_data = data.model_dump(exclude_unset=True)
        if "assigned_member_ids" in update_data and update_data["assigned_member_ids"] is not None:
            # JSONB can't hold UUID objects
            update_data["assigned_member_ids"] = [str(u) for u in update_data["assigned_member_ids"]]
        for key, value in update_data.items():
            setattr(task, key, value)
        await self.db.flush()
        await self._attach_latest_completions([task])
        return task

    async def delete(self, task_id: uuid.UUID, group_id: uuid.UUID) -> bool:
        task = await self.get_by_id(task_id, group_id)
        if not task or not task.is_active:
            return False
        task.is_active = False  # soft delete
        await self.db.flush()
        return True

    # ── The Core: Complete Task ────────────────────────────────────────────────

    async def complete_task(
        self,
        task_id: uuid.UUID,
        user: User,
        group_id: Optional[uuid.UUID] = None,
        note: Optional[str] = None,
    ) -> TaskCompletion:
        task = await self.get_by_id(task_id, group_id, for_update=True)
        if not task or not task.is_active:
            raise HTTPException(404, "Task not found")

        membership = await self._get_membership(task.group_id, user.id)
        if not membership:
            raise HTTPException(403, "You are not a member of this group")

        if task.is_completed_this_period:
            raise HTTPException(409, "This task was already completed for the current period")

        period_start = task.current_period_start or datetime.now(timezone.utc)
        completion = await self._do_complete(task, user, period_start, note)
        chat_line = new_message(task.group_id, user, f"completed {task.emoji} {task.title}", MessageKind.system)
        self.db.add(chat_line)
        await self.db.commit()

        await emit_group_event(
            task.group_id,
            {
                "event": "task_completed",
                "task_id": str(task.id),
                "task_title": task.title,
                "task_emoji": task.emoji,
                "completed_by_id": str(user.id),
                "completed_by_name": user.full_name,
                "completed_at": completion.completed_at.isoformat(),
                "group_id": str(task.group_id),
            },
        )
        await emit_group_event(task.group_id, message_event(chat_line))
        return completion

    async def _do_complete(
        self,
        task: Task,
        user: User,
        period_start: datetime,
        note: Optional[str],
    ) -> TaskCompletion:
        """Writes the completion, activity log and notifications (no commit)."""
        try:
            completion = TaskCompletion(
                task_id=task.id,
                completed_by=user.id,
                completed_at=datetime.now(timezone.utc),
                period_start=period_start,
                note=note,
            )
            completion.completed_by_user = user
            self.db.add(completion)

            task.is_completed_this_period = True
            task.times_completed_total += 1
            task.completion_streak += 1

            await self.db.flush()
        except IntegrityError:
            # DB constraint fired — a duplicate completion slipped past the row lock
            await self.db.rollback()
            raise HTTPException(409, "This task was already completed for the current period")

        self.db.add(ActivityLog(
            group_id=task.group_id,
            user_id=user.id,
            task_id=task.id,
            event_type="task_completed",
            event_data={"task_title": task.title, "task_emoji": task.emoji},
        ))

        recipients = await self._notifiable_member_ids(task.group_id, exclude=user.id)
        self.db.add_all([
            Notification(
                user_id=member_id,
                type=NotificationType.task_completed,
                # Notification titles are VARCHAR(200): leave room for emoji + " completed"
                title=f"{task.emoji} {_shorten(task.title, 178)} completed",
                body=f"{user.full_name} completed this task",
                actor_id=user.id,
                group_id=task.group_id,
                task_id=task.id,
                extra_data={"task_emoji": task.emoji, "completer_name": user.full_name},
            )
            for member_id in recipients
        ])
        return completion

    async def undo_complete_task(
        self,
        task_id: uuid.UUID,
        user: User,
        group_id: Optional[uuid.UUID] = None,
    ) -> Task:
        """
        Reverses the current period's completion. Only the user who completed
        it can undo it, and only before the task resets.
        """
        task = await self.get_by_id(task_id, group_id, for_update=True)
        if not task or not task.is_active:
            raise HTTPException(404, "Task not found")

        membership = await self._get_membership(task.group_id, user.id)
        if not membership:
            raise HTTPException(403, "You are not a member of this group")

        if not task.is_completed_this_period:
            raise HTTPException(409, "This task has not been completed yet")

        result = await self.db.execute(
            select(TaskCompletion).where(
                TaskCompletion.task_id == task.id,
                TaskCompletion.period_start == task.current_period_start,
            )
        )
        completion = result.scalar_one_or_none()
        if not completion:
            raise HTTPException(404, "No completion record found for this period")
        if completion.completed_by != user.id:
            raise HTTPException(403, "You can only undo your own completions")

        await self.db.delete(completion)
        task.is_completed_this_period = False
        task.times_completed_total = max(0, task.times_completed_total - 1)
        task.completion_streak = max(0, task.completion_streak - 1)

        self.db.add(ActivityLog(
            group_id=task.group_id,
            user_id=user.id,
            task_id=task.id,
            event_type="task_completion_undone",
            event_data={"task_title": task.title, "task_emoji": task.emoji},
        ))
        chat_line = new_message(task.group_id, user, f"undid {task.emoji} {task.title}", MessageKind.system)
        self.db.add(chat_line)
        await self.db.commit()

        await emit_group_event(
            task.group_id,
            {
                "event": "task_completion_undone",
                "task_id": str(task.id),
                "task_title": task.title,
                "task_emoji": task.emoji,
                "undone_by_id": str(user.id),
                "undone_by_name": user.full_name,
                "group_id": str(task.group_id),
            },
        )
        await emit_group_event(task.group_id, message_event(chat_line))
        task.latest_completion = None
        return task

    # ── Resets ────────────────────────────────────────────────────────────────

    @staticmethod
    def apply_reset(task: Task) -> dict:
        """
        Resets a loaded task (with recurrence_rule) to pending for its next
        period. Pure state change — returns the event to emit after commit.
        """
        rule = task.recurrence_rule
        next_start, next_end = calculate_period(rule.recurrence_type, rule.interval_value)
        next_reset = calculate_next_reset(
            rule.recurrence_type,
            rule.interval_value,
            rule.cron_expression,
            rule.timezone,
        )

        if not task.is_completed_this_period:
            task.completion_streak = 0  # streak broken — missed this period
        task.is_completed_this_period = False
        task.current_period_start = next_start
        task.current_period_end = next_end or next_reset
        rule.next_reset_at = next_reset

        return {
            "event": "task_reset",
            "task_id": str(task.id),
            "task_title": task.title,
            "task_emoji": task.emoji,
            "next_due": task.current_period_end.isoformat() if task.current_period_end else None,
            "group_id": str(task.group_id),
        }

    async def reset_task(self, task_id: uuid.UUID, group_id: uuid.UUID) -> Optional[Task]:
        """Admin override: force a task into a fresh period right now."""
        task = await self.get_by_id(task_id, group_id, for_update=True)
        if not task or not task.is_active or not task.recurrence_rule:
            return None
        event = self.apply_reset(task)
        await self.db.commit()
        await emit_group_event(task.group_id, event)
        task.latest_completion = None
        return task

    # ── Helpers ───────────────────────────────────────────────────────────────

    async def _get_membership(self, group_id: uuid.UUID, user_id: uuid.UUID) -> Optional[GroupMember]:
        result = await self.db.execute(
            select(GroupMember).where(
                and_(
                    GroupMember.group_id == group_id,
                    GroupMember.user_id == user_id,
                )
            )
        )
        return result.scalar_one_or_none()

    async def _notifiable_member_ids(self, group_id: uuid.UUID, exclude: uuid.UUID) -> List[uuid.UUID]:
        result = await self.db.execute(
            select(GroupMember.user_id).where(
                GroupMember.group_id == group_id,
                GroupMember.user_id != exclude,
                GroupMember.notification_muted == False,  # noqa: E712
            )
        )
        return list(result.scalars().all())


async def run_due_task_resets(db: AsyncSession) -> dict:
    """
    Resets every active task whose period has ended. Shared by the in-process
    scheduler and POST /internal/reset-due-tasks.

    FOR UPDATE SKIP LOCKED lets several workers (or the scheduler and the
    external cron) run this at the same moment without resetting a task twice.
    """
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Task)
        .join(RecurrenceRule, RecurrenceRule.task_id == Task.id)
        .where(RecurrenceRule.next_reset_at <= now, Task.is_active == True)  # noqa: E712
        .options(selectinload(Task.recurrence_rule))
        .order_by(RecurrenceRule.next_reset_at)
        .limit(RESET_BATCH_SIZE)
        .with_for_update(of=[Task, RecurrenceRule], skip_locked=True)
    )
    tasks = list(result.scalars().all())

    events: List[dict] = []
    errors: List[dict] = []
    for task in tasks:
        try:
            events.append(TaskService.apply_reset(task))
        except Exception as exc:
            errors.append({"task_id": str(task.id), "error": str(exc)})
            logger.exception("task.reset.failed", task_id=str(task.id))

    await db.commit()
    for event in events:
        await emit_group_event(event["group_id"], event)

    return {"checked": len(tasks), "reset": len(events), "errors": errors}
