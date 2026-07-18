"""Support tickets and CN recurring waitlist."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0014_support_tickets"
down_revision = "0013_playlist_subscriptions"
branch_labels = None
depends_on = None


def _table_exists(bind, name: str) -> bool:
    return name in sa.inspect(bind).get_table_names()


def upgrade() -> None:
    bind = op.get_bind()
    if not _table_exists(bind, "support_tickets"):
        op.create_table(
            "support_tickets",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("category", sa.String(32), server_default="refund"),
            sa.Column("order_id", sa.String(64), nullable=True),
            sa.Column("subject", sa.String(255), nullable=False),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("status", sa.String(20), server_default="open"),
            sa.Column("admin_note", sa.Text(), nullable=True),
            sa.Column("resolution", sa.String(32), nullable=True),
            sa.Column("credits_granted", sa.Integer(), server_default="0"),
            sa.Column("stripe_refund_id", sa.String(128), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()")),
            sa.Column("resolved_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_support_tickets_user_id", "support_tickets", ["user_id"])
        op.create_index("ix_support_tickets_status", "support_tickets", ["status"])
    if not _table_exists(bind, "cn_recurring_waitlist"):
        op.create_table(
            "cn_recurring_waitlist",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("channel", sa.String(32), server_default="wechat"),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()")),
            sa.UniqueConstraint("user_id", "channel", name="uq_cn_recurring_waitlist_user_channel"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    if _table_exists(bind, "cn_recurring_waitlist"):
        op.drop_table("cn_recurring_waitlist")
    if _table_exists(bind, "support_tickets"):
        op.drop_index("ix_support_tickets_status", table_name="support_tickets")
        op.drop_index("ix_support_tickets_user_id", table_name="support_tickets")
        op.drop_table("support_tickets")
