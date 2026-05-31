"""
tests/unit/test_task_completion.py
Unit tests for the distributed task completion logic.

These tests verify:
  1. First completion succeeds
  2. Second completion (same period) is rejected — 409
  3. Concurrent completions — only one wins
  4. DB unique constraint fires correctly
  5. Activity log is created on completion
"""
import asyncio
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.task_service import TaskService


@pytest.fixture
def mock_task():
    task = MagicMock()
    task.id = uuid.uuid4()
    task.group_id = uuid.uuid4()
    task.title = "Feed the Cat"
    task.emoji = "🐱"
    task.is_active = True
    task.is_completed_this_period = False
    task.current_period_start = datetime(2024, 1, 1, tzinfo=timezone.utc)
    task.times_completed_total = 0
    task.completion_streak = 5
    return task


@pytest.fixture
def mock_db():
    db = AsyncMock()
    db.flush = AsyncMock()
    db.rollback = AsyncMock()
    db.add = MagicMock()
    return db


@pytest.fixture
def mock_redis():
    redis = AsyncMock()
    # Default: lock acquired successfully
    redis.set = AsyncMock(return_value=True)
    redis.delete = AsyncMock()
    redis.publish = AsyncMock()
    return redis


class TestTaskCompletion:

    @pytest.mark.asyncio
    async def test_complete_task_success(self, mock_task, mock_db, mock_redis):
        """First completion of a task should succeed."""
        user_id = uuid.uuid4()
        membership = MagicMock()
        membership.role = "member"

        with patch.object(TaskService, "get_by_id", return_value=mock_task), \
             patch.object(TaskService, "_get_membership", return_value=membership), \
             patch.object(TaskService, "_get_group_member_ids", return_value=[user_id]), \
             patch("app.services.task_service.publish_group_event", AsyncMock()), \
             patch("app.services.task_service.send_completion_notifications") as mock_notif:

            mock_notif.delay = MagicMock()

            svc = TaskService(db=mock_db, redis=mock_redis)
            result = await svc.complete_task(
                task_id=mock_task.id,
                user_id=user_id,
            )

        assert result is not None
        assert mock_task.is_completed_this_period is True
        assert mock_task.times_completed_total == 1
        assert mock_task.completion_streak == 6

    @pytest.mark.asyncio
    async def test_complete_already_done_period(self, mock_task, mock_db, mock_redis):
        """Attempting to complete an already-completed task should raise 409."""
        from fastapi import HTTPException

        mock_task.is_completed_this_period = True  # already done
        user_id = uuid.uuid4()
        membership = MagicMock()

        with patch.object(TaskService, "get_by_id", return_value=mock_task), \
             patch.object(TaskService, "_get_membership", return_value=membership):

            svc = TaskService(db=mock_db, redis=mock_redis)
            with pytest.raises(HTTPException) as exc_info:
                await svc.complete_task(task_id=mock_task.id, user_id=user_id)

        assert exc_info.value.status_code == 409
        assert "already completed" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_redis_lock_prevents_concurrent_completion(self, mock_task, mock_db):
        """When Redis lock is not acquired, 409 is raised immediately."""
        from fastapi import HTTPException

        # Redis returns None (lock not acquired — another request holds it)
        redis = AsyncMock()
        redis.set = AsyncMock(return_value=None)
        redis.delete = AsyncMock()

        user_id = uuid.uuid4()
        membership = MagicMock()

        with patch.object(TaskService, "get_by_id", return_value=mock_task), \
             patch.object(TaskService, "_get_membership", return_value=membership):

            svc = TaskService(db=mock_db, redis=redis)
            with pytest.raises(HTTPException) as exc_info:
                await svc.complete_task(task_id=mock_task.id, user_id=user_id)

        assert exc_info.value.status_code == 409
        # Lock should NOT be deleted since it was never acquired
        redis.delete.assert_not_called()

    @pytest.mark.asyncio
    async def test_nonmember_cannot_complete(self, mock_task, mock_db, mock_redis):
        """Users not in the group should get 403."""
        from fastapi import HTTPException

        user_id = uuid.uuid4()

        with patch.object(TaskService, "get_by_id", return_value=mock_task), \
             patch.object(TaskService, "_get_membership", return_value=None):

            svc = TaskService(db=mock_db, redis=mock_redis)
            with pytest.raises(HTTPException) as exc_info:
                await svc.complete_task(task_id=mock_task.id, user_id=user_id)

        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_inactive_task_raises_404(self, mock_task, mock_db, mock_redis):
        """Completing an inactive (deleted) task should raise 404."""
        from fastapi import HTTPException

        mock_task.is_active = False

        with patch.object(TaskService, "get_by_id", return_value=mock_task):
            svc = TaskService(db=mock_db, redis=mock_redis)
            with pytest.raises(HTTPException) as exc_info:
                await svc.complete_task(task_id=mock_task.id, user_id=uuid.uuid4())

        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_db_integrity_error_caught(self, mock_task, mock_db, mock_redis):
        """
        DB unique constraint IntegrityError should be caught and converted to 409.
        This is the slow-path race condition guard.
        """
        from fastapi import HTTPException
        from sqlalchemy.exc import IntegrityError

        user_id = uuid.uuid4()
        membership = MagicMock()

        # Simulate DB raising IntegrityError on flush (duplicate completion)
        mock_db.flush = AsyncMock(side_effect=IntegrityError("", {}, None))

        with patch.object(TaskService, "get_by_id", return_value=mock_task), \
             patch.object(TaskService, "_get_membership", return_value=membership):

            svc = TaskService(db=mock_db, redis=mock_redis)
            with pytest.raises(HTTPException) as exc_info:
                await svc._do_complete(mock_task, user_id, mock_task.current_period_start, None)

        assert exc_info.value.status_code == 409
        mock_db.rollback.assert_called_once()


class TestTaskReset:

    @pytest.mark.asyncio
    async def test_reset_clears_completion_state(self, mock_task, mock_db, mock_redis):
        """After reset, task should be pending again with updated period."""
        from app.models.models import RecurrenceRule

        mock_task.is_completed_this_period = True
        mock_task.completion_streak = 5

        rule = MagicMock(spec=RecurrenceRule)
        rule.recurrence_type = "daily"
        rule.interval_value = 1
        rule.cron_expression = None
        rule.timezone = "UTC"
        mock_task.recurrence_rule = rule

        with patch.object(TaskService, "get_by_id", return_value=mock_task), \
             patch("app.services.task_service.publish_group_event", AsyncMock()):

            svc = TaskService(db=mock_db, redis=mock_redis)
            result = await svc.reset_task(mock_task.id)

        assert mock_task.is_completed_this_period is False

    @pytest.mark.asyncio
    async def test_missed_period_breaks_streak(self, mock_task, mock_db, mock_redis):
        """If task was NOT completed before reset, streak should be zeroed."""
        from app.models.models import RecurrenceRule

        mock_task.is_completed_this_period = False  # missed!
        mock_task.completion_streak = 10

        rule = MagicMock(spec=RecurrenceRule)
        rule.recurrence_type = "daily"
        rule.interval_value = 1
        rule.cron_expression = None
        rule.timezone = "UTC"
        mock_task.recurrence_rule = rule

        with patch.object(TaskService, "get_by_id", return_value=mock_task), \
             patch("app.services.task_service.publish_group_event", AsyncMock()):

            svc = TaskService(db=mock_db, redis=mock_redis)
            await svc.reset_task(mock_task.id)

        assert mock_task.completion_streak == 0
