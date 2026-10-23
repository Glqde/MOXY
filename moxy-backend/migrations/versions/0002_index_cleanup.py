"""index cleanup — drop redundant indexes, add inbox index

Revision ID: 0002_index_cleanup
Revises: 0001_baseline
Create Date: 2026-10-23

Every table had a second index on its primary key (the PK already is one),
and four single-column indexes duplicated the leading column of a composite
index. Each extra index costs a write on every insert/update.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0002_index_cleanup"
down_revision: Union[str, None] = "0001_baseline"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

PK_INDEXED_TABLES = [
    "users", "device_tokens", "friend_requests", "friendships", "groups",
    "user_settings", "group_members", "tasks", "activity_logs",
    "notifications", "recurrence_rules", "task_completions",
]

# (index, table, column) — each covered by a composite index
PREFIX_DUPLICATES = [
    ("ix_tasks_group_id", "tasks", "group_id"),                       # ix_tasks_group_active
    ("ix_task_completions_task_id", "task_completions", "task_id"),   # uq_task_completion_per_period
    ("ix_activity_logs_group_id", "activity_logs", "group_id"),       # ix_activity_group_time
    ("ix_notifications_user_id", "notifications", "user_id"),         # ix_notifications_user_*
]


def upgrade() -> None:
    op.create_index("ix_notifications_user_created", "notifications", ["user_id", "created_at"])
    op.drop_index("ix_notifications_created", table_name="notifications", if_exists=True)
    for name, table, _ in PREFIX_DUPLICATES:
        op.drop_index(name, table_name=table, if_exists=True)
    for table in PK_INDEXED_TABLES:
        op.drop_index(f"ix_{table}_id", table_name=table, if_exists=True)


def downgrade() -> None:
    for table in PK_INDEXED_TABLES:
        op.create_index(f"ix_{table}_id", table, ["id"])
    for name, table, column in PREFIX_DUPLICATES:
        op.create_index(name, table, [column])
    op.create_index("ix_notifications_created", "notifications", ["created_at"])
    op.drop_index("ix_notifications_user_created", table_name="notifications")
