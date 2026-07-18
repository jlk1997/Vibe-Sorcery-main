"""Commercial: payment terms audit on orders, subscription lifecycle fields."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0009_commercial"
down_revision = "0008_legal_consent"
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

    if "payment_orders" in tables:
        _add_column_if_missing("payment_orders", "payment_terms_version", sa.String(32))
        _add_column_if_missing("payment_orders", "expires_at", sa.DateTime())

    if "user_subscriptions" in tables:
        _add_column_if_missing("user_subscriptions", "plan_id", sa.String(64))
        _add_column_if_missing("user_subscriptions", "channel", sa.String(32))
        _add_column_if_missing(
            "user_subscriptions",
            "cancel_at_period_end",
            sa.Boolean(),
            server_default="false",
        )
        _add_column_if_missing("user_subscriptions", "stripe_customer_id", sa.String(255))


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())

    if "payment_orders" in tables:
        for col in ("payment_terms_version", "expires_at"):
            cols = {c["name"] for c in insp.get_columns("payment_orders")}
            if col in cols:
                op.drop_column("payment_orders", col)

    if "user_subscriptions" in tables:
        for col in ("plan_id", "channel", "cancel_at_period_end", "stripe_customer_id"):
            cols = {c["name"] for c in insp.get_columns("user_subscriptions")}
            if col in cols:
                op.drop_column("user_subscriptions", col)
