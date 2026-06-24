"""
app/services/task_service.py
Task domain logic — the most critical service in MOXY.

The complete_task() method is where the distributed locking, race condition
prevention, and realtime broadcast all come together.

Completion guarantee flow:
  1. Redis SETNX lock acquired (fast path — prevents double-clicks)
  2. DB unique constraint on (task_id, period_start) — last line of defense
  3. On success → broadcast realtime event to all group members
  4. Enqueue notification delivery to all members via Celery
  5. Release Redis lock in finally block
"""
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import and_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.redis import TaskLock, publish_group_event
from app.models.models import ActivityLog, Group, GroupMember, Notification, NotificationType, Task, TaskCompletion
from app.schemas.schemas import TaskCreate, TaskUpdate
from app.utils.recurrence import calculate_period, calculate_next_reset


class TaskService:
    def __init__(self, db: AsyncSession, redis=None):
        self.db = db
        self.redis = redis

    # ── Read ──────────────────────────────────────────────────────────────────

    async def get_by_id(self, task_id: uuid.UUID, load_relations: bool = False) -> Optional[Task]:
        q = select(Task).where(Task.id == task_id)
        if load_relations:
            q = q.options(
                selectinload(Task.recurrence_rule),
                selectinload(Task.completions).selectinload(TaskCompletion.completed_by_user),
            )
        result = await self.db.execute(q)
        return result.scalar_one_or_none()

    async def get_group_tasks(self, group_id: uuid.UUID) -> List[Task]:
        result = await self.db.execute(
            select(Task)
            .where(and_(Task.group_id == group_id, Task.is_active == True))
            .options(
                selectinload(Task.recurrence_rule),
                selectinload(Task.completions).selectinload(TaskCompletion.completed_by_user),
            )
            .order_by(Task.is_pinned.desc(), Task.created_at.asc())
        )
        return list(result.scalars().all())

    async def get_latest_completion(self, task_id: uuid.UUID) -> Optional[TaskCompletion]:
        result = await self.db.execute(
            select(TaskCompletion)
            .where(TaskCompletion.task_id == task_id)
            .options(selectinload(TaskCompletion.completed_by_user))
            .order_by(TaskCompletion.completed_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    # ── Create / Update / Delete ───────────────────────────────────────────────

    async def create(self, group_id: uuid.UUID, created_by: uuid.UUID, data: TaskCreate) -> Task:
        period_start, period_end = calculate_period(
            data.recurrence.recurrence_type,
            data.recurrence.interval_value,
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
            current_period_end=period_end,
        )
        self.db.add(task)
        await self.db.flush()

        from app.models.models import RecurrenceRule
        rule = RecurrenceRule(
            task_id=task.id,
            recurrence_type=data.recurrence.recurrence_type,
            interval_value=data.recurrence.interval_value,
            cron_expression=data.recurrence.cron_expression,
            timezone=data.recurrence.timezone,
            cooldown_minutes=data.recurrence.cooldown_minutes,
            next_reset_at=period_end,
        )
        self.db.add(rule)
        await self.db.flush()

        # Reload with relations so FastAPI can serialize the response
        return await self.get_by_id(task.id, load_relations=True)

    async def update(self, task_id: uuid.UUID, data: TaskUpdate) -> Optional[Task]:
        task = await self.get_by_id(task_id)
        if not task:
            return None
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(task, key, value)
        await self.db.flush()
        return task

    async def delete(self, task_id: uuid.UUID) -> bool:
        task = await self.get_by_id(task_id)
        if not task:
            return False
        task.is_active = False  # soft delete
        await self.db.flush()
        return True

    # ── The Core: Complete Task ────────────────────────────────────────────────

    async def complete_task(
        self,
        task_id: uuid.UUID,
        user_id: uuid.UUID,
        note: Optional[str] = None,
    ) -> TaskCompletion:
        from fastapi import HTTPException

        # Force fresh read from DB, bypassing identity map cache
        self.db.expire_all()

        task = await self.get_by_id(task_id, load_relations=True)
        if not task or not task.is_active:
            raise HTTPException(404, "Task not found")

        membership = await self._get_membership(task.group_id, user_id)
        if not membership:
            raise HTTPException(403, "You are not a member of this group")

        if task.is_completed_this_period:
            raise HTTPException(409, "This task was already completed for the current period")

        period_start = task.current_period_start or datetime.now(timezone.utc)

        if not self.redis:
            return await self._do_complete(task, user_id, period_start, note)

        # IMPORTANT: only lock ACQUISITION is allowed to fail-soft here.
        # _do_complete() must run AT MOST ONCE per request — calling it twice
        # inserts two TaskCompletion rows for the same (task_id, period_start)
        # in the same transaction and self-collides on the unique constraint,
        # rolling back the legitimate completion along with it.
        lock = TaskLock(self.redis, str(task_id))
        try:
            acquired = await lock.__aenter__()
        except Exception:
            # Redis itself unreachable — proceed without the lock.
            # The DB unique constraint is still the last line of defense.
            acquired = None

        if acquired is False:
            await lock.__aexit__(None, None, None)
            raise HTTPException(
                409,
                "Another member is completing this task right now. Try again in a moment."
            )

        try:
            return await self._do_complete(task, user_id, period_start, note)
        finally:
            if acquired:
                try:
                    await lock.__aexit__(None, None, None)
                except Exception:
                    pass

    async def _do_complete(
        self,
        task: Task,
        user_id: uuid.UUID,
        period_start: datetime,
        note: Optional[str],
    ) -> TaskCompletion:
        """
        Inner completion logic — runs while Redis lock is held.
        DB unique constraint on (task_id, period_start) is the last guard.
        """
        from fastapi import HTTPException

        try:
            # ── STEP 2: Insert completion record ───────────────────────────
            completion = TaskCompletion(
                task_id=task.id,
                completed_by=user_id,
                period_start=period_start,
                note=note,
            )
            self.db.add(completion)

            # Update task state
            task.is_completed_this_period = True
            task.times_completed_total += 1
            task.completion_streak += 1

            await self.db.flush()

        except IntegrityError:
            # ── STEP 3: DB constraint fired — duplicate completion attempt ──
            # TEMP DEBUG: show the real underlying error
            await self.db.rollback()
            raise HTTPException(409, "This task was already completed for the current period")

        # ── STEP 4: Log to activity feed ───────────────────────────────────
        log = ActivityLog(
            group_id=task.group_id,
            user_id=user_id,
            task_id=task.id,
            event_type="task_completed",
            event_data={"task_title": task.title, "task_emoji": task.emoji},
        )
        self.db.add(log)

        # ── STEP 5: Create notifications for all group members ─────────────
        try:
            member_ids = await self._get_group_member_ids(task.group_id)
            from app.workers.tasks import send_completion_notifications
            send_completion_notifications.delay(
                task_id=str(task.id),
                task_title=task.title,
                task_emoji=task.emoji,
                completed_by_id=str(user_id),
                group_id=str(task.group_id),
                member_ids=[str(m) for m in member_ids],
            )
        except Exception:
            import logging
            logging.getLogger(__name__).exception(
                "Failed to enqueue completion notifications for task %s", task.id
            )

        # ── STEP 6: Publish realtime event via Redis Pub/Sub ───────────────
        # This fires BEFORE commit — if commit fails, clients get a transient
        # "ghost" event. Acceptable tradeoff for low latency; clients re-sync
        # on reconnect. For strong consistency, move publish to after commit.
        if self.redis:
            try:
                from app.services.user_service import UserService
                user_service = UserService(self.db)
                completer = await user_service.get_by_id(user_id)

                await publish_group_event(
                    self.redis,
                    str(task.group_id),
                    {
                        "event": "task_completed",
                        "task_id": str(task.id),
                        "task_title": task.title,
                        "task_emoji": task.emoji,
                        "completed_by_id": str(user_id),
                        "completed_by_name": completer.full_name if completer else "A member",
                        "completed_at": datetime.now(timezone.utc).isoformat(),
                        "group_id": str(task.group_id),
                    },
                )
            except Exception:
                import logging
                logging.getLogger(__name__).exception(
                    "Failed to publish task_completed event for task %s", task.id
                )

        return completion

    async def reset_task(self, task_id: uuid.UUID) -> Task:
        """
        Called by Celery when a recurrence period ends.
        Resets the task to pending state and calculates the next period.
        """
        task = await self.get_by_id(task_id, load_relations=True)
        if not task or not task.recurrence_rule:
            return task

        rule = task.recurrence_rule
        was_completed = task.is_completed_this_period

        # Calculate next period
        next_start, next_end = calculate_period(
            rule.recurrence_type,
            rule.interval_value,
        )
        next_reset = calculate_next_reset(
            rule.recurrence_type,
            rule.interval_value,
            rule.cron_expression,
            rule.timezone,
        )

        # Reset task state
        task.is_completed_this_period = False
        task.current_period_start = next_start
        task.current_period_end = next_end
        if not was_completed:
            task.completion_streak = 0  # streak broken — missed this period

        rule.next_reset_at = next_reset
        await self.db.flush()

        # Broadcast reset to group
        if self.redis:
            await publish_group_event(
                self.redis,
                str(task.group_id),
                {
                    "event": "task_reset",
                    "task_id": str(task.id),
                    "task_title": task.title,
                    "task_emoji": task.emoji,
                    "next_due": next_end.isoformat() if next_end else None,
                    "group_id": str(task.group_id),
                },
            )

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

    async def _get_group_member_ids(self, group_id: uuid.UUID) -> List[uuid.UUID]:
        result = await self.db.execute(
            select(GroupMember.user_id).where(GroupMember.group_id == group_id)
        )
        return list(result.scalars().all())

    async def verify_group_membership(
        self, task_id: uuid.UUID, user_id: uuid.UUID
    ) -> GroupMember:
        """Raises 403 if user is not a member of the task's group."""
        from fastapi import HTTPException

        task = await self.get_by_id(task_id)
        if not task:
            raise HTTPException(404, "Task not found")

        membership = await self._get_membership(task.group_id, user_id)
        if not membership:
            raise HTTPException(403, "You are not a member of this group")

        return membership