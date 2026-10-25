"""group chat — group_messages table and per-member read marker

Revision ID: 0004_group_chat
Revises: 0003_schema_repair
Create Date: 2026-10-25

Checks before creating: in development the app's create_all may already
have made the new table on startup.
"""
from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa

revision: str = "0004_group_chat"
down_revision: Union[str, None] = "0003_schema_repair"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _exists(check) -> bool:
    if context.is_offline_mode():
        return False
    return check(sa.inspect(op.get_bind()))


def upgrade() -> None:
    if not _exists(lambda i: i.has_table("group_messages")):
        op.create_table(
            "group_messages",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("group_id", sa.UUID(), nullable=False),
            sa.Column("user_id", sa.UUID(), nullable=True),
            sa.Column("kind", sa.String(length=10), nullable=False),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["group_id"], ["groups.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_group_messages_group_created", "group_messages", ["group_id", "created_at"])

    if not _exists(lambda i: any(c["name"] == "chat_last_read_at" for c in i.get_columns("group_members"))):
        op.add_column("group_members", sa.Column("chat_last_read_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("group_members", "chat_last_read_at")
    op.drop_index("ix_group_messages_group_created", table_name="group_messages")
    op.drop_table("group_messages")
