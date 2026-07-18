"""Concurrency: job columns, idempotency keys, draft uniqueness."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0005_concurrency_consistency"
down_revision = "0004_admin_audit"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    job_cols = {c["name"] for c in insp.get_columns("generation_jobs")}

    if "tenant_id" not in job_cols:
        op.add_column("generation_jobs", sa.Column("tenant_id", sa.String(64), nullable=True))
        op.create_index("ix_generation_jobs_tenant_id", "generation_jobs", ["tenant_id"])
    if "version" not in job_cols:
        op.add_column(
            "generation_jobs",
            sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        )
    if "idempotency_key" not in job_cols:
        op.add_column("generation_jobs", sa.Column("idempotency_key", sa.String(128), nullable=True))
        op.create_index("ix_generation_jobs_idempotency_key", "generation_jobs", ["idempotency_key"])
    if "post_process_pending" not in job_cols:
        op.add_column(
            "generation_jobs",
            sa.Column("post_process_pending", sa.Integer(), server_default="0", nullable=False),
        )

    if "generation_idempotency_keys" not in set(insp.get_table_names()):
        op.create_table(
            "generation_idempotency_keys",
            sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("key", sa.String(128), nullable=False),
            sa.Column("job_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("generation_jobs.id"), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("user_id", "key", name="uq_generation_idempotency_user_key"),
        )
        op.create_index("ix_generation_idempotency_created_at", "generation_idempotency_keys", ["created_at"])

    draft_cols = {c["name"] for c in insp.get_columns("studio_drafts")}
    if "archived" not in draft_cols:
        op.add_column(
            "studio_drafts",
            sa.Column("archived", sa.Boolean(), server_default="false", nullable=False),
        )

    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_studio_drafts_user_mode_active
        ON studio_drafts (user_id, mode)
        WHERE archived IS NOT TRUE
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_studio_drafts_user_mode_active")
    op.drop_table("generation_idempotency_keys")
    for col in ("post_process_pending", "idempotency_key", "version", "tenant_id"):
        try:
            op.drop_column("generation_jobs", col)
        except Exception:
            pass
    try:
        op.drop_column("studio_drafts", "archived")
    except Exception:
        pass
