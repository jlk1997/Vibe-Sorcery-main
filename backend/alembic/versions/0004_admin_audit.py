"""Admin audit logs table."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0004_admin_audit"
down_revision = "0003_commercial_engagement"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "admin_audit_logs" not in set(insp.get_table_names()):
        op.create_table(
            "admin_audit_logs",
            sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("admin_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("action", sa.String(64), nullable=False),
            sa.Column("target", sa.String(255), nullable=True),
            sa.Column("detail", sa.dialects.postgresql.JSONB(), server_default="{}"),
            sa.Column("created_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_admin_audit_logs_admin_id", "admin_audit_logs", ["admin_id"])
        op.create_index("ix_admin_audit_logs_action", "admin_audit_logs", ["action"])


def downgrade() -> None:
    op.drop_table("admin_audit_logs")
