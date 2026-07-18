"""Studio draft optimistic version column."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0006_studio_draft_version"
down_revision = "0005_concurrency_consistency"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = {c["name"] for c in insp.get_columns("studio_drafts")}
    if "version" not in cols:
        op.add_column(
            "studio_drafts",
            sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        )


def downgrade() -> None:
    try:
        op.drop_column("studio_drafts", "version")
    except Exception:
        pass
