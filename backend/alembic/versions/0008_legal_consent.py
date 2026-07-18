"""User consent fields, consent logs, work AI flag, post consent."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0008_legal_consent"
down_revision = "0007_work_version"
branch_labels = None
depends_on = None


def _add_column_if_missing(
    table: str,
    column: str,
    col_type: sa.types.TypeEngine,
    *,
    server_default: str | sa.sql.elements.TextClause | None = None,
) -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = {c["name"] for c in insp.get_columns(table)}
    if column not in cols:
        default = server_default
        if isinstance(server_default, str):
            default = sa.text(server_default)
        op.add_column(
            table,
            sa.Column(column, col_type, server_default=default) if default is not None else sa.Column(column, col_type),
        )


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())

    if "users" in tables:
        _add_column_if_missing("users", "terms_accepted_at", sa.DateTime())
        _add_column_if_missing("users", "terms_version", sa.String(32))
        _add_column_if_missing("users", "privacy_accepted_at", sa.DateTime())
        _add_column_if_missing("users", "privacy_version", sa.String(32))
        _add_column_if_missing("users", "ai_notice_accepted_at", sa.DateTime())
        _add_column_if_missing("users", "wechat_privacy_authorized_at", sa.DateTime())
        _add_column_if_missing("users", "analytics_consent", sa.Boolean(), server_default="false")
        _add_column_if_missing("users", "deleted_at", sa.DateTime())
        _add_column_if_missing("users", "deletion_scheduled_at", sa.DateTime())

    if "works" in tables:
        _add_column_if_missing("works", "is_ai_generated", sa.Boolean(), server_default="true")

    if "posts" in tables:
        _add_column_if_missing("posts", "consent_at", sa.DateTime())

    if "user_consent_logs" not in tables:
        op.create_table(
            "user_consent_logs",
            sa.Column("id", sa.UUID(), primary_key=True),
            sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("consent_type", sa.String(64), nullable=False),
            sa.Column("version", sa.String(32), nullable=False),
            sa.Column("ip_address", sa.String(64), nullable=True),
            sa.Column("user_agent", sa.String(512), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_user_consent_logs_user_id", "user_consent_logs", ["user_id"])
        op.create_index("ix_user_consent_logs_consent_type", "user_consent_logs", ["consent_type"])


def downgrade() -> None:
    try:
        op.drop_table("user_consent_logs")
    except Exception:
        pass
    for table, col in [
        ("users", "deletion_scheduled_at"),
        ("users", "deleted_at"),
        ("users", "analytics_consent"),
        ("users", "wechat_privacy_authorized_at"),
        ("users", "ai_notice_accepted_at"),
        ("users", "privacy_version"),
        ("users", "privacy_accepted_at"),
        ("users", "terms_version"),
        ("users", "terms_accepted_at"),
        ("works", "is_ai_generated"),
        ("posts", "consent_at"),
    ]:
        try:
            op.drop_column(table, col)
        except Exception:
            pass
