"""
app/workers/celery_app.py
Celery application instance with Beat schedule.

Beat runs reset_due_tasks every 60 seconds.
Workers pick up on-demand tasks (notifications, reminders) as they arrive.

Run worker:  celery -A app.workers.celery_app worker --loglevel=info -c 4
Run beat:    celery -A app.workers.celery_app beat --loglevel=info
"""
from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery(
    "moxy",
    broker=settings.REDIS_CELERY_URL,
    backend=settings.REDIS_CELERY_URL,
    include=["app.workers.tasks"],
)

celery_app.conf.update(
    # Serialization
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],

    # Timezone
    timezone="UTC",
    enable_utc=True,

    # Reliability
    task_acks_late=True,              # ack only after task completes
    task_reject_on_worker_lost=True,  # re-queue on worker crash
    worker_prefetch_multiplier=1,     # don't prefetch — ensures fair distribution
    task_track_started=True,

    # Result backend (for monitoring)
    result_expires=3600,              # keep results for 1 hour

    # Rate limiting per task type
    task_annotations={
        "tasks.send_completion_notifications": {"rate_limit": "100/m"},
        "tasks.send_task_reminder": {"rate_limit": "200/m"},
    },

    # ── Beat Schedule ─────────────────────────────────────────────────────────
    beat_schedule={
        # Check for tasks to reset every 60 seconds
        # Fine-grained enough for minute-level recurrences
        "reset-due-tasks": {
            "task": "tasks.reset_due_tasks",
            "schedule": 60.0,  # every 60 seconds
        },
        # TODO: add daily analytics aggregation, weekly digest emails, etc.
    },
)
