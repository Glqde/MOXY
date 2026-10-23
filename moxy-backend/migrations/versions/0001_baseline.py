"""baseline — schema as created by Base.metadata.create_all before migrations existed

Revision ID: 0001_baseline
Revises:
Create Date: 2026-10-23

Databases created before migrations existed already have these tables, so
this revision detects that and does nothing — `alembic upgrade head` is safe
to run against them and continues straight to 0002.
"""
from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0001_baseline"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if not context.is_offline_mode() and sa.inspect(op.get_bind()).has_table("users"):
        return  # pre-migration database: schema already matches this revision

    op.create_table('users',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('email', sa.String(length=255), nullable=False),
    sa.Column('full_name', sa.String(length=255), nullable=False),
    sa.Column('avatar_url', sa.String(length=512), nullable=True),
    sa.Column('username', sa.String(length=64), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_index(op.f('ix_users_id'), 'users', ['id'], unique=False)
    op.create_index(op.f('ix_users_username'), 'users', ['username'], unique=True)
    op.create_table('device_tokens',
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('token', sa.String(length=512), nullable=False),
    sa.Column('platform', sa.String(length=20), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', 'token', name='uq_device_token')
    )
    op.create_index(op.f('ix_device_tokens_id'), 'device_tokens', ['id'], unique=False)
    op.create_index(op.f('ix_device_tokens_user_id'), 'device_tokens', ['user_id'], unique=False)
    op.create_table('friend_requests',
    sa.Column('sender_id', sa.UUID(), nullable=False),
    sa.Column('receiver_id', sa.UUID(), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('message', sa.String(length=280), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['receiver_id'], ['users.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['sender_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('sender_id', 'receiver_id', name='uq_friend_request')
    )
    op.create_index(op.f('ix_friend_requests_id'), 'friend_requests', ['id'], unique=False)
    op.create_index(op.f('ix_friend_requests_receiver_id'), 'friend_requests', ['receiver_id'], unique=False)
    op.create_index('ix_friend_requests_receiver_status', 'friend_requests', ['receiver_id', 'status'], unique=False)
    op.create_index(op.f('ix_friend_requests_sender_id'), 'friend_requests', ['sender_id'], unique=False)
    op.create_table('friendships',
    sa.Column('user_id_1', sa.UUID(), nullable=False),
    sa.Column('user_id_2', sa.UUID(), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id_1'], ['users.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id_2'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id_1', 'user_id_2', name='uq_friendship')
    )
    op.create_index('ix_friendship_user1', 'friendships', ['user_id_1'], unique=False)
    op.create_index('ix_friendship_user2', 'friendships', ['user_id_2'], unique=False)
    op.create_index(op.f('ix_friendships_id'), 'friendships', ['id'], unique=False)
    op.create_table('groups',
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.Column('description', sa.String(length=500), nullable=True),
    sa.Column('icon', sa.String(length=10), nullable=False),
    sa.Column('color', sa.String(length=7), nullable=False),
    sa.Column('is_private', sa.Boolean(), nullable=False),
    sa.Column('invite_code', sa.String(length=12), nullable=True),
    sa.Column('vacation_mode', sa.Boolean(), nullable=False),
    sa.Column('created_by', sa.UUID(), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_groups_id'), 'groups', ['id'], unique=False)
    op.create_index(op.f('ix_groups_invite_code'), 'groups', ['invite_code'], unique=True)
    op.create_table('user_settings',
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('theme', sa.String(length=10), nullable=False),
    sa.Column('notification_sound', sa.String(length=60), nullable=False),
    sa.Column('email_notifications', sa.Boolean(), nullable=False),
    sa.Column('push_notifications', sa.Boolean(), nullable=False),
    sa.Column('timezone', sa.String(length=60), nullable=False),
    sa.Column('vacation_mode', sa.Boolean(), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id')
    )
    op.create_index(op.f('ix_user_settings_id'), 'user_settings', ['id'], unique=False)
    op.create_table('group_members',
    sa.Column('group_id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('role', sa.String(length=20), nullable=False),
    sa.Column('joined_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('notification_muted', sa.Boolean(), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['group_id'], ['groups.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('group_id', 'user_id', name='uq_group_member')
    )
    op.create_index(op.f('ix_group_members_id'), 'group_members', ['id'], unique=False)
    op.create_index('ix_group_members_user', 'group_members', ['user_id'], unique=False)
    op.create_table('tasks',
    sa.Column('group_id', sa.UUID(), nullable=False),
    sa.Column('created_by', sa.UUID(), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('emoji', sa.String(length=10), nullable=False),
    sa.Column('category', sa.String(length=60), nullable=True),
    sa.Column('priority', sa.String(length=10), nullable=False),
    sa.Column('tags', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('is_pinned', sa.Boolean(), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('assigned_member_ids', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('current_period_start', sa.DateTime(timezone=True), nullable=True),
    sa.Column('current_period_end', sa.DateTime(timezone=True), nullable=True),
    sa.Column('is_completed_this_period', sa.Boolean(), nullable=False),
    sa.Column('completion_streak', sa.Integer(), nullable=False),
    sa.Column('times_completed_total', sa.Integer(), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['group_id'], ['groups.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_tasks_group_active', 'tasks', ['group_id', 'is_active'], unique=False)
    op.create_index(op.f('ix_tasks_group_id'), 'tasks', ['group_id'], unique=False)
    op.create_index(op.f('ix_tasks_id'), 'tasks', ['id'], unique=False)
    op.create_index('ix_tasks_period', 'tasks', ['current_period_end'], unique=False)
    op.create_table('activity_logs',
    sa.Column('group_id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('task_id', sa.UUID(), nullable=True),
    sa.Column('event_type', sa.String(length=60), nullable=False),
    sa.Column('event_data', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('occurred_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.ForeignKeyConstraint(['group_id'], ['groups.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_activity_group_time', 'activity_logs', ['group_id', 'occurred_at'], unique=False)
    op.create_index(op.f('ix_activity_logs_group_id'), 'activity_logs', ['group_id'], unique=False)
    op.create_index(op.f('ix_activity_logs_id'), 'activity_logs', ['id'], unique=False)
    op.create_index(op.f('ix_activity_logs_occurred_at'), 'activity_logs', ['occurred_at'], unique=False)
    op.create_table('notifications',
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('type', sa.String(length=40), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('body', sa.String(length=500), nullable=True),
    sa.Column('is_read', sa.Boolean(), nullable=False),
    sa.Column('actor_id', sa.UUID(), nullable=True),
    sa.Column('group_id', sa.UUID(), nullable=True),
    sa.Column('task_id', sa.UUID(), nullable=True),
    sa.Column('extra_data', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['actor_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['group_id'], ['groups.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_notifications_created', 'notifications', ['created_at'], unique=False)
    op.create_index(op.f('ix_notifications_id'), 'notifications', ['id'], unique=False)
    op.create_index(op.f('ix_notifications_user_id'), 'notifications', ['user_id'], unique=False)
    op.create_index('ix_notifications_user_unread', 'notifications', ['user_id', 'is_read'], unique=False)
    op.create_table('recurrence_rules',
    sa.Column('task_id', sa.UUID(), nullable=False),
    sa.Column('recurrence_type', sa.String(length=20), nullable=False),
    sa.Column('interval_value', sa.Integer(), nullable=True),
    sa.Column('cron_expression', sa.String(length=100), nullable=True),
    sa.Column('timezone', sa.String(length=60), nullable=False),
    sa.Column('cooldown_minutes', sa.Integer(), nullable=False),
    sa.Column('next_reset_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('snooze_until', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('task_id')
    )
    op.create_index(op.f('ix_recurrence_rules_id'), 'recurrence_rules', ['id'], unique=False)
    op.create_index(op.f('ix_recurrence_rules_next_reset_at'), 'recurrence_rules', ['next_reset_at'], unique=False)
    op.create_table('task_completions',
    sa.Column('task_id', sa.UUID(), nullable=False),
    sa.Column('completed_by', sa.UUID(), nullable=False),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('period_start', sa.DateTime(timezone=True), nullable=False),
    sa.Column('note', sa.String(length=500), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.ForeignKeyConstraint(['completed_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('task_id', 'period_start', name='uq_task_completion_per_period')
    )
    op.create_index(op.f('ix_task_completions_id'), 'task_completions', ['id'], unique=False)
    op.create_index('ix_task_completions_period', 'task_completions', ['period_start'], unique=False)
    op.create_index(op.f('ix_task_completions_task_id'), 'task_completions', ['task_id'], unique=False)
    op.create_index('ix_task_completions_user', 'task_completions', ['completed_by'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_task_completions_user', table_name='task_completions')
    op.drop_index(op.f('ix_task_completions_task_id'), table_name='task_completions')
    op.drop_index('ix_task_completions_period', table_name='task_completions')
    op.drop_index(op.f('ix_task_completions_id'), table_name='task_completions')
    op.drop_table('task_completions')
    op.drop_index(op.f('ix_recurrence_rules_next_reset_at'), table_name='recurrence_rules')
    op.drop_index(op.f('ix_recurrence_rules_id'), table_name='recurrence_rules')
    op.drop_table('recurrence_rules')
    op.drop_index('ix_notifications_user_unread', table_name='notifications')
    op.drop_index(op.f('ix_notifications_user_id'), table_name='notifications')
    op.drop_index(op.f('ix_notifications_id'), table_name='notifications')
    op.drop_index('ix_notifications_created', table_name='notifications')
    op.drop_table('notifications')
    op.drop_index(op.f('ix_activity_logs_occurred_at'), table_name='activity_logs')
    op.drop_index(op.f('ix_activity_logs_id'), table_name='activity_logs')
    op.drop_index(op.f('ix_activity_logs_group_id'), table_name='activity_logs')
    op.drop_index('ix_activity_group_time', table_name='activity_logs')
    op.drop_table('activity_logs')
    op.drop_index('ix_tasks_period', table_name='tasks')
    op.drop_index(op.f('ix_tasks_id'), table_name='tasks')
    op.drop_index(op.f('ix_tasks_group_id'), table_name='tasks')
    op.drop_index('ix_tasks_group_active', table_name='tasks')
    op.drop_table('tasks')
    op.drop_index('ix_group_members_user', table_name='group_members')
    op.drop_index(op.f('ix_group_members_id'), table_name='group_members')
    op.drop_table('group_members')
    op.drop_index(op.f('ix_user_settings_id'), table_name='user_settings')
    op.drop_table('user_settings')
    op.drop_index(op.f('ix_groups_invite_code'), table_name='groups')
    op.drop_index(op.f('ix_groups_id'), table_name='groups')
    op.drop_table('groups')
    op.drop_index(op.f('ix_friendships_id'), table_name='friendships')
    op.drop_index('ix_friendship_user2', table_name='friendships')
    op.drop_index('ix_friendship_user1', table_name='friendships')
    op.drop_table('friendships')
    op.drop_index(op.f('ix_friend_requests_sender_id'), table_name='friend_requests')
    op.drop_index('ix_friend_requests_receiver_status', table_name='friend_requests')
    op.drop_index(op.f('ix_friend_requests_receiver_id'), table_name='friend_requests')
    op.drop_index(op.f('ix_friend_requests_id'), table_name='friend_requests')
    op.drop_table('friend_requests')
    op.drop_index(op.f('ix_device_tokens_user_id'), table_name='device_tokens')
    op.drop_index(op.f('ix_device_tokens_id'), table_name='device_tokens')
    op.drop_table('device_tokens')
    op.drop_index(op.f('ix_users_username'), table_name='users')
    op.drop_index(op.f('ix_users_id'), table_name='users')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_table('users')
