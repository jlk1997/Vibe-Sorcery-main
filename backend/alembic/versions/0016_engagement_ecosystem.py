"""Engagement ecosystem: moderation, listen checkins, leaderboards, duels."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0016_engagement_ecosystem"
down_revision = "0015_queue_ux"
branch_labels = None
depends_on = None


def _column_exists(bind, table: str, column: str) -> bool:
    insp = sa.inspect(bind)
    if table not in insp.get_table_names():
        return False
    return column in {c["name"] for c in insp.get_columns(table)}


def _table_exists(bind, table: str) -> bool:
    return table in sa.inspect(bind).get_table_names()


def upgrade() -> None:
    bind = op.get_bind()

    if not _table_exists(bind, "moderation_words"):
        op.create_table(
            "moderation_words",
            sa.Column("id", UUID(as_uuid=True), primary_key=True),
            sa.Column("pattern", sa.String(255), nullable=False),
            sa.Column("category", sa.String(64), default="general"),
            sa.Column("level", sa.String(16), default="block"),
            sa.Column("enabled", sa.Boolean(), default=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_moderation_words_enabled", "moderation_words", ["enabled"])

    if _table_exists(bind, "comments"):
        if not _column_exists(bind, "comments", "parent_id"):
            op.add_column("comments", sa.Column("parent_id", UUID(as_uuid=True), nullable=True))
            op.create_foreign_key("fk_comments_parent", "comments", "comments", ["parent_id"], ["id"])
        if not _column_exists(bind, "comments", "is_filtered"):
            op.add_column("comments", sa.Column("is_filtered", sa.Boolean(), default=False))

    if _table_exists(bind, "reports"):
        if not _column_exists(bind, "reports", "comment_id"):
            op.add_column("reports", sa.Column("comment_id", UUID(as_uuid=True), nullable=True))
            op.create_foreign_key("fk_reports_comment", "reports", "comments", ["comment_id"], ["id"])

    if _table_exists(bind, "challenges"):
        if not _column_exists(bind, "challenges", "sponsor_label"):
            op.add_column("challenges", sa.Column("sponsor_label", sa.String(128), nullable=True))
        if not _column_exists(bind, "challenges", "awards_distributed"):
            op.add_column("challenges", sa.Column("awards_distributed", sa.Boolean(), default=False))

    if not _table_exists(bind, "listen_checkins"):
        op.create_table(
            "listen_checkins",
            sa.Column("id", UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("work_id", UUID(as_uuid=True), sa.ForeignKey("works.id"), nullable=False),
            sa.Column("entry_date", sa.Date(), nullable=False),
            sa.Column("listen_ratio", sa.Float(), default=0.0),
            sa.Column("arousal", sa.Float(), nullable=True),
            sa.Column("valence", sa.Float(), nullable=True),
            sa.Column("mood_tags", JSONB, default=list),
            sa.Column("resonance_score", sa.Float(), default=0.0),
            sa.Column("credits_granted", sa.Boolean(), default=False),
            sa.Column("created_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_listen_checkins_user_date", "listen_checkins", ["user_id", "entry_date"])
        op.create_index("ix_listen_checkins_work", "listen_checkins", ["work_id"])

    if not _table_exists(bind, "work_engagement_stats"):
        op.create_table(
            "work_engagement_stats",
            sa.Column("work_id", UUID(as_uuid=True), sa.ForeignKey("works.id"), primary_key=True),
            sa.Column("listen_completes", sa.Integer(), default=0),
            sa.Column("resonance_total", sa.Float(), default=0.0),
            sa.Column("resonance_count", sa.Integer(), default=0),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )

    if not _table_exists(bind, "leaderboard_snapshots"):
        op.create_table(
            "leaderboard_snapshots",
            sa.Column("id", UUID(as_uuid=True), primary_key=True),
            sa.Column("chart_type", sa.String(32), nullable=False),
            sa.Column("period_key", sa.String(32), nullable=False),
            sa.Column("payload", JSONB, default=list),
            sa.Column("created_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_leaderboard_snapshots_type_period", "leaderboard_snapshots", ["chart_type", "period_key"])

    if not _table_exists(bind, "duels"):
        op.create_table(
            "duels",
            sa.Column("id", UUID(as_uuid=True), primary_key=True),
            sa.Column("challenger_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("challenger_work_id", UUID(as_uuid=True), sa.ForeignKey("works.id"), nullable=False),
            sa.Column("opponent_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("opponent_work_id", UUID(as_uuid=True), sa.ForeignKey("works.id"), nullable=True),
            sa.Column("theme", sa.String(64), default="emotion"),
            sa.Column("status", sa.String(24), default="pending"),
            sa.Column("vote_ends_at", sa.DateTime(), nullable=True),
            sa.Column("winner_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("challenger_votes", sa.Integer(), default=0),
            sa.Column("opponent_votes", sa.Integer(), default=0),
            sa.Column("challenger_resonance", sa.Float(), default=0.0),
            sa.Column("opponent_resonance", sa.Float(), default=0.0),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("settled_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_duels_status", "duels", ["status"])

    if not _table_exists(bind, "duel_votes"):
        op.create_table(
            "duel_votes",
            sa.Column("id", UUID(as_uuid=True), primary_key=True),
            sa.Column("duel_id", UUID(as_uuid=True), sa.ForeignKey("duels.id"), nullable=False),
            sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("side", sa.String(8), nullable=False),
            sa.Column("listen_ratio", sa.Float(), default=0.0),
            sa.Column("emotion_tag", sa.String(64), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("duel_id", "user_id", name="uq_duel_vote_user"),
        )

    if not _table_exists(bind, "user_duel_quotas"):
        op.create_table(
            "user_duel_quotas",
            sa.Column("id", UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("quota_date", sa.Date(), nullable=False),
            sa.Column("free_starts_used", sa.Integer(), default=0),
            sa.Column("pass_starts_remaining", sa.Integer(), default=0),
            sa.UniqueConstraint("user_id", "quota_date", name="uq_user_duel_quota_date"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    for table in (
        "user_duel_quotas",
        "duel_votes",
        "duels",
        "leaderboard_snapshots",
        "work_engagement_stats",
        "listen_checkins",
        "moderation_words",
    ):
        if _table_exists(bind, table):
            op.drop_table(table)
    if _table_exists(bind, "comments"):
        if _column_exists(bind, "comments", "is_filtered"):
            op.drop_column("comments", "is_filtered")
        if _column_exists(bind, "comments", "parent_id"):
            op.drop_constraint("fk_comments_parent", "comments", type_="foreignkey")
            op.drop_column("comments", "parent_id")
    if _table_exists(bind, "reports") and _column_exists(bind, "reports", "comment_id"):
        op.drop_constraint("fk_reports_comment", "reports", type_="foreignkey")
        op.drop_column("reports", "comment_id")
    if _table_exists(bind, "challenges"):
        if _column_exists(bind, "challenges", "awards_distributed"):
            op.drop_column("challenges", "awards_distributed")
        if _column_exists(bind, "challenges", "sponsor_label"):
            op.drop_column("challenges", "sponsor_label")
