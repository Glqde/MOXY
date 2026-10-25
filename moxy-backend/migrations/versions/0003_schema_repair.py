"""schema repair — add columns missing from databases created by older code

Revision ID: 0003_schema_repair
Revises: 0002_index_cleanup
Create Date: 2026-10-25

Production's tables were created by create_all from code older than the
first commit, so they don't all match the models (notifications had no
extra_data column, which made completing a task fail once a group had other
members to notify). 0001 assumed an existing database matched and skipped.

This compares a frozen snapshot of the expected columns with the live
database and only ever adds or renames — it never drops anything, and on a
database that already matches it does nothing. Each change is printed so the
deploy log shows what was out of date.
"""
from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0003_schema_repair"
down_revision: Union[str, None] = "0002_index_cleanup"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Columns an older schema had under a different name: (table, new) -> old
LEGACY_NAMES = {
    ("notifications", "extra_data"): "metadata",
}

# (column, python-side scalar default) as of 0002 — frozen on purpose, so
# later model changes don't leak into this revision
EXPECTED = {
    'activity_logs': [
        (sa.Column('group_id', sa.UUID(), nullable=False), None),
        (sa.Column('user_id', sa.UUID(), nullable=False), None),
        (sa.Column('task_id', sa.UUID(), nullable=True), None),
        (sa.Column('event_type', sa.String(length=60), nullable=False), None),
        (sa.Column('event_data', postgresql.JSONB(astext_type=sa.Text()), nullable=True), None),
        (sa.Column('occurred_at', sa.DateTime(timezone=True), nullable=False), None),
        (sa.Column('id', sa.UUID(), nullable=False), None),
    ],
    'device_tokens': [
        (sa.Column('user_id', sa.UUID(), nullable=False), None),
        (sa.Column('token', sa.String(length=512), nullable=False), None),
        (sa.Column('platform', sa.String(length=20), nullable=False), None),
        (sa.Column('is_active', sa.Boolean(), nullable=False), True),
        (sa.Column('id', sa.UUID(), nullable=False), None),
        (sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False), None),
        (sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False), None),
    ],
    'friend_requests': [
        (sa.Column('sender_id', sa.UUID(), nullable=False), None),
        (sa.Column('receiver_id', sa.UUID(), nullable=False), None),
        (sa.Column('status', sa.String(length=20), nullable=False), 'pending'),
        (sa.Column('message', sa.String(length=280), nullable=True), None),
        (sa.Column('id', sa.UUID(), nullable=False), None),
        (sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False), None),
        (sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False), None),
    ],
    'friendships': [
        (sa.Column('user_id_1', sa.UUID(), nullable=False), None),
        (sa.Column('user_id_2', sa.UUID(), nullable=False), None),
        (sa.Column('id', sa.UUID(), nullable=False), None),
        (sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False), None),
        (sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False), None),
    ],
    'group_members': [
        (sa.Column('group_id', sa.UUID(), nullable=False), None),
        (sa.Column('user_id', sa.UUID(), nullable=False), None),
        (sa.Column('role', sa.String(length=20), nullable=False), 'member'),
        (sa.Column('joined_at', sa.DateTime(timezone=True), nullable=False), None),
        (sa.Column('notification_muted', sa.Boolean(), nullable=False), False),
        (sa.Column('id', sa.UUID(), nullable=False), None),
        (sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False), None),
        (sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False), None),
    ],
    'groups': [
        (sa.Column('name', sa.String(length=120), nullable=False), None),
        (sa.Column('description', sa.String(length=500), nullable=True), None),
        (sa.Column('icon', sa.String(length=10), nullable=False), '🏠'),
        (sa.Column('color', sa.String(length=7), nullable=False), '#7C6FFF'),
        (sa.Column('is_private', sa.Boolean(), nullable=False), False),
        (sa.Column('invite_code', sa.String(length=12), nullable=True), None),
        (sa.Column('vacation_mode', sa.Boolean(), nullable=False), False),
        (sa.Column('created_by', sa.UUID(), nullable=False), None),
        (sa.Column('id', sa.UUID(), nullable=False), None),
        (sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False), None),
        (sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False), None),
    ],
    'notifications': [
        (sa.Column('user_id', sa.UUID(), nullable=False), None),
        (sa.Column('type', sa.String(length=40), nullable=False), None),
        (sa.Column('title', sa.String(length=200), nullable=False), None),
        (sa.Column('body', sa.String(length=500), nullable=True), None),
        (sa.Column('is_read', sa.Boolean(), nullable=False), False),
        (sa.Column('actor_id', sa.UUID(), nullable=True), None),
        (sa.Column('group_id', sa.UUID(), nullable=True), None),
        (sa.Column('task_id', sa.UUID(), nullable=True), None),
        (sa.Column('extra_data', postgresql.JSONB(astext_type=sa.Text()), nullable=True), None),
        (sa.Column('id', sa.UUID(), nullable=False), None),
        (sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False), None),
        (sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False), None),
    ],
    'recurrence_rules': [
        (sa.Column('task_id', sa.UUID(), nullable=False), None),
        (sa.Column('recurrence_type', sa.String(length=20), nullable=False), None),
        (sa.Column('interval_value', sa.Integer(), nullable=True), None),
        (sa.Column('cron_expression', sa.String(length=100), nullable=True), None),
        (sa.Column('timezone', sa.String(length=60), nullable=False), 'UTC'),
        (sa.Column('cooldown_minutes', sa.Integer(), nullable=False), 0),
        (sa.Column('next_reset_at', sa.DateTime(timezone=True), nullable=True), None),
        (sa.Column('snooze_until', sa.DateTime(timezone=True), nullable=True), None),
        (sa.Column('id', sa.UUID(), nullable=False), None),
        (sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False), None),
        (sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False), None),
    ],
    'task_completions': [
        (sa.Column('task_id', sa.UUID(), nullable=False), None),
        (sa.Column('completed_by', sa.UUID(), nullable=False), None),
        (sa.Column('completed_at', sa.DateTime(timezone=True), nullable=False), None),
        (sa.Column('period_start', sa.DateTime(timezone=True), nullable=False), None),
        (sa.Column('note', sa.String(length=500), nullable=True), None),
        (sa.Column('id', sa.UUID(), nullable=False), None),
    ],
    'tasks': [
        (sa.Column('group_id', sa.UUID(), nullable=False), None),
        (sa.Column('created_by', sa.UUID(), nullable=False), None),
        (sa.Column('title', sa.String(length=200), nullable=False), None),
        (sa.Column('description', sa.Text(), nullable=True), None),
        (sa.Column('emoji', sa.String(length=10), nullable=False), '✅'),
        (sa.Column('category', sa.String(length=60), nullable=True), None),
        (sa.Column('priority', sa.String(length=10), nullable=False), 'medium'),
        (sa.Column('tags', postgresql.JSONB(astext_type=sa.Text()), nullable=True), None),
        (sa.Column('is_pinned', sa.Boolean(), nullable=False), False),
        (sa.Column('is_active', sa.Boolean(), nullable=False), True),
        (sa.Column('assigned_member_ids', postgresql.JSONB(astext_type=sa.Text()), nullable=True), None),
        (sa.Column('current_period_start', sa.DateTime(timezone=True), nullable=True), None),
        (sa.Column('current_period_end', sa.DateTime(timezone=True), nullable=True), None),
        (sa.Column('is_completed_this_period', sa.Boolean(), nullable=False), False),
        (sa.Column('completion_streak', sa.Integer(), nullable=False), 0),
        (sa.Column('times_completed_total', sa.Integer(), nullable=False), 0),
        (sa.Column('id', sa.UUID(), nullable=False), None),
        (sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False), None),
        (sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False), None),
    ],
    'user_settings': [
        (sa.Column('user_id', sa.UUID(), nullable=False), None),
        (sa.Column('theme', sa.String(length=10), nullable=False), 'dark'),
        (sa.Column('notification_sound', sa.String(length=60), nullable=False), 'chime'),
        (sa.Column('email_notifications', sa.Boolean(), nullable=False), True),
        (sa.Column('push_notifications', sa.Boolean(), nullable=False), True),
        (sa.Column('timezone', sa.String(length=60), nullable=False), 'UTC'),
        (sa.Column('vacation_mode', sa.Boolean(), nullable=False), False),
        (sa.Column('id', sa.UUID(), nullable=False), None),
        (sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False), None),
        (sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False), None),
    ],
    'users': [
        (sa.Column('id', sa.UUID(), nullable=False), None),
        (sa.Column('email', sa.String(length=255), nullable=False), None),
        (sa.Column('full_name', sa.String(length=255), nullable=False), None),
        (sa.Column('avatar_url', sa.String(length=512), nullable=True), None),
        (sa.Column('username', sa.String(length=64), nullable=True), None),
        (sa.Column('is_active', sa.Boolean(), nullable=False), True),
        (sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=True), None),
        (sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False), None),
        (sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False), None),
    ],
}


def _server_default(default):
    """Lets a NOT NULL column be added to a table that already has rows."""
    if isinstance(default, bool):
        return sa.true() if default else sa.false()
    if isinstance(default, int):
        return sa.text(str(default))
    if isinstance(default, str):
        return sa.text("'" + default.replace("'", "''") + "'")
    return None


def upgrade() -> None:
    if context.is_offline_mode():
        return  # needs to inspect the live database

    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())
    changes = []

    for table, columns in EXPECTED.items():
        if table not in tables:
            changes.append(f"table {table} is missing (not created here)")
            continue
        existing = {c["name"] for c in inspector.get_columns(table)}
        for column, default in columns:
            if column.name in existing:
                continue

            legacy = LEGACY_NAMES.get((table, column.name))
            if legacy and legacy in existing:
                op.alter_column(table, legacy, new_column_name=column.name)
                changes.append(f"renamed {table}.{legacy} -> {column.name}")
                continue

            server_default = (
                column.server_default.arg if column.server_default is not None else _server_default(default)
            )
            op.add_column(table, sa.Column(
                column.name,
                column.type,
                # Without a default, existing rows would violate NOT NULL
                nullable=column.nullable if server_default is not None else True,
                server_default=server_default,
            ))
            changes.append(f"added {table}.{column.name}")

    for change in changes or ["schema already matches — nothing to repair"]:
        print(f"[0003_schema_repair] {change}")


def downgrade() -> None:
    # Repairs only add what the code requires; removing them would break it
    pass
