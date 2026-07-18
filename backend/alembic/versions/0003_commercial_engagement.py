"""Commercial engagement tables + style preset member_only."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0003_commercial_engagement"
down_revision = "0002_style_presets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())

    if "user_daily_checkins" not in tables:
        op.create_table(
            "user_daily_checkins",
            sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("checkin_date", sa.Date(), nullable=False),
            sa.Column("credits_granted", sa.Integer(), server_default="0"),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("user_id", "checkin_date", name="uq_user_checkin_date"),
        )
        op.create_index("ix_user_daily_checkins_user_id", "user_daily_checkins", ["user_id"])

    if "user_task_progress" not in tables:
        op.create_table(
            "user_task_progress",
            sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("task_key", sa.String(64), nullable=False),
            sa.Column("credits_granted", sa.Integer(), server_default="0"),
            sa.Column("completed_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("user_id", "task_key", name="uq_user_task"),
        )
        op.create_index("ix_user_task_progress_user_id", "user_task_progress", ["user_id"])

    if "style_presets" in tables:
        cols = {c["name"] for c in insp.get_columns("style_presets")}
        if "member_only" not in cols:
            op.add_column(
                "style_presets",
                sa.Column("member_only", sa.Boolean(), server_default="false", nullable=False),
            )


def downgrade() -> None:
    op.drop_column("style_presets", "member_only")
    op.drop_index("ix_user_task_progress_user_id", table_name="user_task_progress")
    op.drop_table("user_task_progress")
    op.drop_index("ix_user_daily_checkins_user_id", table_name="user_daily_checkins")
    op.drop_table("user_daily_checkins")
