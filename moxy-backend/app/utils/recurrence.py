"""
app/utils/recurrence.py
Period and next-reset calculations for recurring tasks.
All datetimes are UTC internally; display conversion happens at the API layer.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple

from croniter import croniter


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def calculate_period(
    recurrence_type: str,
    interval_value: Optional[int] = None,
) -> Tuple[datetime, Optional[datetime]]:
    """
    Returns (period_start, period_end) for the CURRENT period.
    period_end is when the task will reset (and also the due date).
    """
    now = utcnow()

    if recurrence_type == "minutes":
        delta = timedelta(minutes=interval_value or 60)
        return now, now + delta

    elif recurrence_type == "hourly":
        # Aligns to the top of the current hour
        start = now.replace(minute=0, second=0, microsecond=0)
        return start, start + timedelta(hours=interval_value or 1)

    elif recurrence_type == "daily":
        # Aligns to midnight UTC
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        return start, start + timedelta(days=interval_value or 1)

    elif recurrence_type == "weekly":
        # Aligns to Monday midnight UTC
        start = now - timedelta(days=now.weekday())
        start = start.replace(hour=0, minute=0, second=0, microsecond=0)
        return start, start + timedelta(weeks=interval_value or 1)

    elif recurrence_type == "monthly":
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        # End of month: first day of next month
        if start.month == 12:
            end = start.replace(year=start.year + 1, month=1)
        else:
            end = start.replace(month=start.month + 1)
        return start, end

    else:
        # custom / fallback — period starts now, no defined end
        return now, None


def calculate_next_reset(
    recurrence_type: str,
    interval_value: Optional[int],
    cron_expression: Optional[str],
    timezone_str: str = "UTC",
) -> Optional[datetime]:
    """
    Calculate when this task should next be reset by Celery.
    For custom cron expressions, uses croniter.
    """
    if recurrence_type == "custom" and cron_expression:
        try:
            cron = croniter(cron_expression, utcnow())
            return cron.get_next(datetime).replace(tzinfo=timezone.utc)
        except Exception:
            return None

    _, period_end = calculate_period(recurrence_type, interval_value)
    return period_end


def get_human_readable_recurrence(recurrence_type: str, interval_value: Optional[int]) -> str:
    """Returns display string like 'Every 3 days', 'Daily', 'Weekly'."""
    if recurrence_type == "minutes":
        return f"Every {interval_value or 60} minutes"
    elif recurrence_type == "hourly":
        v = interval_value or 1
        return f"Every {v} hour{'s' if v > 1 else ''}"
    elif recurrence_type == "daily":
        v = interval_value or 1
        return "Daily" if v == 1 else f"Every {v} days"
    elif recurrence_type == "weekly":
        v = interval_value or 1
        return "Weekly" if v == 1 else f"Every {v} weeks"
    elif recurrence_type == "monthly":
        return "Monthly"
    else:
        return "Custom schedule"
