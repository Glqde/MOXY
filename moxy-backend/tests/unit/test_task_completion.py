"""
tests/unit/test_task_completion.py
Unit tests for task completion and reset logic.

These tests verify:
  1. First completion succeeds, notifies other members, commits before broadcasting
  2. Second completion (same period) is rejected — 409
  3. Non-members get 403, deleted tasks 404
  4. DB unique constraint fires correctly
  5. Resets clear state, break streaks, and emit only after commit
"""
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from sqlalchemy.dialects import postgresql
from sqlalchemy.exc import IntegrityError

from app.models.models import Notification, RecurrenceRule
from app.services.task_service import TaskService, run_due_task_resets


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
def user():
    u = MagicMock()
    u.id = uuid.uuid4()
    u.full_name = "Asha"
    return u


@pytest.fixture
def mock_db():
    db = AsyncMock()
    db.add = MagicMock()
    db.add_all = MagicMock()
    return db


def _daily_rule():
    rule = MagicMock(spec=RecurrenceRule)
    rule.recurrence_type = "daily"
    rule.interval_value = 1
    rule.cron_expression = None
    rule.timezone = "UTC"
    return rule


class TestTaskCompletion:

    @pytest.mark.asyncio
    async def test_complete_task_success(self, mock_task, mock_db, user):
        """First completion succeeds, notifies the other member, emits after commit."""
        other_member = uuid.uuid4()
        order = []
        mock_db.commit = AsyncMock(side_effect=lambda: order.append("commit"))
        emit = AsyncMock(side_effect=lambda *a, **k: order.append("emit"))

        with patch.object(TaskService, "get_by_id", return_value=mock_task), \
             patch.object(TaskService, "_get_membership", return_value=MagicMock()), \
             patch.object(TaskService, "_notifiable_member_ids", return_value=[other_member]), \
             patch("app.services.task_service.emit_group_event", emit):

            svc = TaskService(db=mock_db)
            result = await svc.complete_task(task_id=mock_task.id, user=user, group_id=mock_task.group_id)

        assert result.completed_by == user.id
        assert mock_task.is_completed_this_period is True
        assert mock_task.times_completed_total == 1
        assert mock_task.completion_streak == 6
        assert order == ["commit", "emit"]

        notifications = mock_db.add_all.call_args.args[0]
        assert [n.user_id for n in notifications] == [other_member]
        assert all(isinstance(n, Notification) for n in notifications)
        assert emit.call_args.args[1]["completed_by_name"] == "Asha"

    @pytest.mark.asyncio
    async def test_complete_already_done_period(self, mock_task, mock_db, user):
        """Attempting to complete an already-completed task should raise 409."""
        mock_task.is_completed_this_period = True

        with patch.object(TaskService, "get_by_id", return_value=mock_task), \
             patch.object(TaskService, "_get_membership", return_value=MagicMock()):

            svc = TaskService(db=mock_db)
            with pytest.raises(HTTPException) as exc_info:
                await svc.complete_task(task_id=mock_task.id, user=user)

        assert exc_info.value.status_code == 409
        assert "already completed" in exc_info.value.detail.lower()
        mock_db.commit.assert_not_called()

    @pytest.mark.asyncio
    async def test_completion_locks_task_row(self, mock_task, mock_db, user):
        """The task must be read FOR UPDATE so concurrent completions serialize."""
        get_by_id = AsyncMock(return_value=mock_task)
        mock_task.is_completed_this_period = True

        with patch.object(TaskService, "get_by_id", get_by_id), \
             patch.object(TaskService, "_get_membership", return_value=MagicMock()):
            with pytest.raises(HTTPException):
                await TaskService(db=mock_db).complete_task(task_id=mock_task.id, user=user)

        assert get_by_id.call_args.kwargs["for_update"] is True

    @pytest.mark.asyncio
    async def test_nonmember_cannot_complete(self, mock_task, mock_db, user):
        """Users not in the group should get 403."""
        with patch.object(TaskService, "get_by_id", return_value=mock_task), \
             patch.object(TaskService, "_get_membership", return_value=None):

            svc = TaskService(db=mock_db)
            with pytest.raises(HTTPException) as exc_info:
                await svc.complete_task(task_id=mock_task.id, user=user)

        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_inactive_task_raises_404(self, mock_task, mock_db, user):
        """Completing an inactive (deleted) task should raise 404."""
        mock_task.is_active = False

        with patch.object(TaskService, "get_by_id", return_value=mock_task):
            svc = TaskService(db=mock_db)
            with pytest.raises(HTTPException) as exc_info:
                await svc.complete_task(task_id=mock_task.id, user=user)

        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_db_integrity_error_caught(self, mock_task, mock_db, user):
        """DB unique constraint IntegrityError should be caught and converted to 409."""
        mock_db.flush = AsyncMock(side_effect=IntegrityError("", {}, None))

        svc = TaskService(db=mock_db)
        with pytest.raises(HTTPException) as exc_info:
            await svc._do_complete(mock_task, user, mock_task.current_period_start, None)

        assert exc_info.value.status_code == 409
        mock_db.rollback.assert_called_once()


class TestTaskScoping:

    def test_task_lookup_is_scoped_to_group(self):
        """Lookups with a group_id must filter on it — prevents cross-group edits."""
        q = TaskService(db=MagicMock())._task_query(uuid.uuid4(), uuid.uuid4())
        sql = str(q.compile(dialect=postgresql.dialect()))
        assert "tasks.group_id = " in sql


class TestTaskReset:

    def test_reset_clears_completion_state(self, mock_task):
        """After reset, task should be pending again with updated period."""
        mock_task.is_completed_this_period = True
        mock_task.recurrence_rule = _daily_rule()

        event = TaskService.apply_reset(mock_task)

        assert mock_task.is_completed_this_period is False
        assert mock_task.completion_streak == 5  # completed → streak kept
        assert event["event"] == "task_reset"
        assert mock_task.recurrence_rule.next_reset_at == mock_task.current_period_end

    def test_missed_period_breaks_streak(self, mock_task):
        """If task was NOT completed before reset, streak should be zeroed."""
        mock_task.completion_streak = 10
        mock_task.recurrence_rule = _daily_rule()

        TaskService.apply_reset(mock_task)

        assert mock_task.completion_streak == 0

    @pytest.mark.asyncio
    async def test_run_due_task_resets_emits_after_commit(self, mock_task, mock_db):
        """run_due_task_resets is importable at module level and broadcasts post-commit."""
        mock_task.recurrence_rule = _daily_rule()
        result = MagicMock()
        result.scalars.return_value.all.return_value = [mock_task]
        mock_db.execute = AsyncMock(return_value=result)
        order = []
        mock_db.commit = AsyncMock(side_effect=lambda: order.append("commit"))
        emit = AsyncMock(side_effect=lambda *a, **k: order.append("emit"))

        with patch("app.services.task_service.emit_group_event", emit):
            summary = await run_due_task_resets(mock_db)

        assert summary == {"checked": 1, "reset": 1, "errors": []}
        assert order == ["commit", "emit"]
        sql = str(mock_db.execute.call_args.args[0].compile(dialect=postgresql.dialect()))
        assert "FOR UPDATE" in sql and "SKIP LOCKED" in sql
