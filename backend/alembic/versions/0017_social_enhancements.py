"""Social enhancements: public tip messages."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0017_social_enhancements"
down_revision = "0016_engagement_ecosystem"
branch_labels = None
depends_on = None


def _column_exists(bind, table: str, column: str) -> bool:
    insp = sa.inspect(bind)
    if table not in insp.get_table_names():
        return False
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    if _table_exists(bind, "creator_tips"):
        if not _column_exists(bind, "creator_tips", "public_message"):
            op.add_column("creator_tips", sa.Column("public_message", sa.Text(), nullable=True))
        if not _column_exists(bind, "creator_tips", "is_public"):
            op.add_column("creator_tips", sa.Column("is_public", sa.Boolean(), server_default="false"))


def _table_exists(bind, table: str) -> bool:
    return table in sa.inspect(bind).get_table_names()


def downgrade() -> None:
    bind = op.get_bind()
    if _table_exists(bind, "creator_tips"):
        if _column_exists(bind, "creator_tips", "is_public"):
            op.drop_column("creator_tips", "is_public")
        if _column_exists(bind, "creator_tips", "public_message"):
            op.drop_column("creator_tips", "public_message")
