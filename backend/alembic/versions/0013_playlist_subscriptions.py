"""Playlist subscriptions for public playlist discovery."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0013_playlist_subscriptions"
down_revision = "0012_phase_d"
branch_labels = None
depends_on = None


def _table_exists(bind, name: str) -> bool:
    return name in sa.inspect(bind).get_table_names()


def upgrade() -> None:
    bind = op.get_bind()
    if not _table_exists(bind, "playlist_subscriptions"):
        op.create_table(
            "playlist_subscriptions",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("playlist_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("playlists.id"), nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()")),
            sa.UniqueConstraint("user_id", "playlist_id", name="uq_playlist_subscription_user"),
        )
        op.create_index("ix_playlist_subscriptions_user_id", "playlist_subscriptions", ["user_id"])


def downgrade() -> None:
    bind = op.get_bind()
    if _table_exists(bind, "playlist_subscriptions"):
        op.drop_index("ix_playlist_subscriptions_user_id", table_name="playlist_subscriptions")
        op.drop_table("playlist_subscriptions")
