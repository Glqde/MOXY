"""
app/workers/tasks.py
Celery task definitions.
"""
import asyncio
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import List

import structlog
from celery import shared_task

from app.workers.celery_app import celery_app

logger = structlog.get_logger(__name__)


def _run_async(coro):
    """Helper to run async code from synchronous Celery tasks."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()
        asyncio.set_event_loop(None)


@asynccontextmanager
async def _get_fresh_db():
    """Create a fresh engine+session per task to avoid event loop mismatch."""
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.orm import sessionmaker
    from app.core.config import settings

    engine = create_async_engine(settings.DATABASE_URL, pool_pre_ping=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with async_session() as session:
            async with session.begin():
                yield session
    finally:
        await engine.dispose()


async def _get_fresh_redis():
    """Create a fresh Redis connection for this task's event loop."""
    import redis.asyncio as aioredis
    from app.core.config import settings
    return aioredis.from_url(settings.REDIS_URL)


# ─── Scheduled: Reset Due Tasks ───────────────────────────────────────────────

@celery_app.task(
    name="tasks.reset_due_tasks",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
    acks_late=True,
)
def reset_due_tasks(self):
    """
    Runs every minute via Celery Beat.
    Queries RecurrenceRule rows where next_reset_at <= now()
    and resets each task's completion state.
    """
    async def _inner():
        from sqlalchemy import select, and_
        from app.models.models import RecurrenceRule, Task
        from app.services.task_service import TaskService

        now = datetime.now(timezone.utc)
        redis = await _get_fresh_redis()

        try:
            async with _get_fresh_db() as db:
                result = await db.execute(
                    select(RecurrenceRule)
                    .join(Task, Task.id == RecurrenceRule.task_id)
                    .where(
                        and_(
                            RecurrenceRule.next_reset_at <= now,
                            Task.is_active == True,
                        )
                    )
                )
                rules = list(result.scalars().all())

                logger.info("reset_due_tasks.found", count=len(rules), now=now.isoformat())

                task_service = TaskService(db=db, redis=redis)
                for rule in rules:
                    try:
                        await task_service.reset_task(rule.task_id)
                        logger.info("task.reset", task_id=str(rule.task_id))
                    except Exception as exc:
                        logger.error("task.reset.failed", task_id=str(rule.task_id), error=str(exc))
        finally:
            await redis.aclose()

    try:
        _run_async(_inner())
    except Exception as exc:
        logger.error("reset_due_tasks.failed", error=str(exc))
        raise self.retry(exc=exc)


# ─── On-Demand: Completion Notifications ─────────────────────────────────────

@celery_app.task(
    name="tasks.send_completion_notifications",
    bind=True,
    max_retries=3,
    default_retry_delay=10,
    acks_late=True,
)
def send_completion_notifications(
    self,
    task_id: str,
    task_title: str,
    task_emoji: str,
    completed_by_id: str,
    group_id: str,
    member_ids: List[str],
):
    """
    Delivers notifications to all group members after a task completion.
    """
    async def _inner():
        from app.models.models import Notification, NotificationType
        from app.services.user_service import UserService

        async with _get_fresh_db() as db:
            user_svc = UserService(db)
            completer = await user_svc.get_by_id(uuid.UUID(completed_by_id))
            completer_name = completer.full_name if completer else "A member"

            title = f"{task_emoji} {task_title} completed"
            body = f"{completer_name} completed this task"

            notif_rows = []
            for member_id_str in member_ids:
                member_id = uuid.UUID(member_id_str)
                if member_id == uuid.UUID(completed_by_id):
                    continue

                notif = Notification(
                    user_id=member_id,
                    type=NotificationType.task_completed,
                    title=title,
                    body=body,
                    actor_id=uuid.UUID(completed_by_id),
                    group_id=uuid.UUID(group_id),
                    task_id=uuid.UUID(task_id),
                    extra_data={
                        "task_emoji": task_emoji,
                        "completer_name": completer_name,
                    },
                )
                notif_rows.append(notif)

            db.add_all(notif_rows)

            logger.info(
                "notifications.sent",
                task_id=task_id,
                recipient_count=len(notif_rows),
            )

    try:
        _run_async(_inner())
    except Exception as exc:
        logger.error("send_completion_notifications.failed", error=str(exc))
        raise self.retry(exc=exc)


# ─── On-Demand: Task Reminder ─────────────────────────────────────────────────

@celery_app.task(
    name="tasks.send_task_reminder",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
)
def send_task_reminder(self, task_id: str, group_id: str, member_ids: List[str]):
    """
    Sends a reminder notification when a task is approaching its due time.
    """
    async def _inner():
        from app.models.models import Notification, NotificationType, Task
        from sqlalchemy import select

        async with _get_fresh_db() as db:
            result = await db.execute(select(Task).where(Task.id == uuid.UUID(task_id)))
            task = result.scalar_one_or_none()

            if not task or task.is_completed_this_period:
                return

            notif_rows = [
                Notification(
                    user_id=uuid.UUID(mid),
                    type=NotificationType.task_reminder,
                    title=f"⏰ {task.title} is due soon",
                    body="Tap to mark it complete",
                    group_id=uuid.UUID(group_id),
                    task_id=task.id,
                )
                for mid in member_ids
            ]
            db.add_all(notif_rows)

    try:
        _run_async(_inner())
    except Exception as exc:
        raise self.retry(exc=exc)