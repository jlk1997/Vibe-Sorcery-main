"""Baseline schema from SQLAlchemy models.

Revision ID: 0001_baseline
Revises:
Create Date: 2026-07-06

For databases created before Alembic, stamp with:
  alembic stamp 0001_baseline
"""

from __future__ import annotations

from alembic import op
from sqlalchemy import text

revision = "0001_baseline"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    bind = op.get_bind()
    from app.database import Base
    import app.models.schemas  # noqa: F401

    Base.metadata.create_all(bind=bind)


def downgrade() -> None:
    bind = op.get_bind()
    from app.database import Base
    import app.models.schemas  # noqa: F401

    Base.metadata.drop_all(bind=bind)
