"""Performance indexes for payment order queries."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0010_payment_indexes"
down_revision = "0009_commercial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "payment_orders" not in insp.get_table_names():
        return
    existing = {idx["name"] for idx in insp.get_indexes("payment_orders")}
    if "ix_payment_orders_status_expires_at" not in existing:
        op.create_index(
            "ix_payment_orders_status_expires_at",
            "payment_orders",
            ["status", "expires_at"],
            unique=False,
        )
    if "ix_payment_orders_user_created" not in existing:
        op.create_index(
            "ix_payment_orders_user_created",
            "payment_orders",
            ["user_id", "created_at"],
            unique=False,
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "payment_orders" not in insp.get_table_names():
        return
    existing = {idx["name"] for idx in insp.get_indexes("payment_orders")}
    if "ix_payment_orders_status_expires_at" in existing:
        op.drop_index("ix_payment_orders_status_expires_at", table_name="payment_orders")
    if "ix_payment_orders_user_created" in existing:
        op.drop_index("ix_payment_orders_user_created", table_name="payment_orders")
