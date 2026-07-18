"""Phase D: emotion journal entries."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0012_phase_d"
down_revision = "0011_ecosystem"
branch_labels = None
depends_on = None


def _table_exists(bind, name: str) -> bool:
    return name in sa.inspect(bind).get_table_names()


def upgrade() -> None:
    bind = op.get_bind()
    if not _table_exists(bind, "emotion_journal_entries"):
        op.create_table(
            "emotion_journal_entries",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("entry_date", sa.Date(), nullable=False),
            sa.Column("arousal", sa.Float(), nullable=True),
            sa.Column("valence", sa.Float(), nullable=True),
            sa.Column("work_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("works.id"), nullable=True),
            sa.Column("mood_tags", postgresql.JSONB(), server_default="[]"),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()")),
        )
        op.create_index("ix_emotion_journal_user_date", "emotion_journal_entries", ["user_id", "entry_date"])


def downgrade() -> None:
    bind = op.get_bind()
    if _table_exists(bind, "emotion_journal_entries"):
        op.drop_index("ix_emotion_journal_user_date", table_name="emotion_journal_entries")
        op.drop_table("emotion_journal_entries")
