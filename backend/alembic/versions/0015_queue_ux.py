"""Generation job error_code for structured client feedback."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0015_queue_ux"
down_revision = "0014_support_tickets"
branch_labels = None
depends_on = None


def _column_exists(bind, table: str, column: str) -> bool:
    insp = sa.inspect(bind)
    if table not in insp.get_table_names():
        return False
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    if not _column_exists(bind, "generation_jobs", "error_code"):
        op.add_column("generation_jobs", sa.Column("error_code", sa.String(64), nullable=True))
        op.create_index("ix_generation_jobs_error_code", "generation_jobs", ["error_code"])


def downgrade() -> None:
    bind = op.get_bind()
    if _column_exists(bind, "generation_jobs", "error_code"):
        op.drop_index("ix_generation_jobs_error_code", table_name="generation_jobs")
        op.drop_column("generation_jobs", "error_code")
