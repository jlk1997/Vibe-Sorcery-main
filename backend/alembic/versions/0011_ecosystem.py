"""Ecosystem expansion: tips, exports, templates, wallets, invoices, challenge prizes."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0011_ecosystem"
down_revision = "0010_payment_indexes"
branch_labels = None
depends_on = None


def _table_exists(bind, name: str) -> bool:
    return name in sa.inspect(bind).get_table_names()


def upgrade() -> None:
    bind = op.get_bind()

    if not _table_exists(bind, "creator_tips"):
        op.create_table(
            "creator_tips",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("from_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("to_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("work_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("works.id"), nullable=True),
            sa.Column("credits", sa.Integer(), nullable=False),
            sa.Column("platform_fee", sa.Integer(), default=0),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()")),
        )
        op.create_index("ix_creator_tips_to_user", "creator_tips", ["to_user_id"])

    if not _table_exists(bind, "work_exports"):
        op.create_table(
            "work_exports",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("work_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("works.id"), nullable=False),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("export_type", sa.String(32), nullable=False),
            sa.Column("status", sa.String(20), default="ready"),
            sa.Column("license_id", sa.String(64), nullable=True),
            sa.Column("meta", postgresql.JSONB(), server_default="{}"),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()")),
        )

    if not _table_exists(bind, "recipe_templates"):
        op.create_table(
            "recipe_templates",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("owner_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("title", sa.String(255), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("spec", postgresql.JSONB(), server_default="{}"),
            sa.Column("price_credits", sa.Integer(), default=0),
            sa.Column("purchase_count", sa.Integer(), default=0),
            sa.Column("is_public", sa.Boolean(), default=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()")),
        )

    if not _table_exists(bind, "recipe_template_purchases"):
        op.create_table(
            "recipe_template_purchases",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("template_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("recipe_templates.id"), nullable=False),
            sa.Column("buyer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("credits_paid", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()")),
            sa.UniqueConstraint("template_id", "buyer_id", name="uq_template_buyer"),
        )

    if not _table_exists(bind, "paid_work_packs"):
        op.create_table(
            "paid_work_packs",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("owner_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("title", sa.String(255), nullable=False),
            sa.Column("work_ids", postgresql.JSONB(), server_default="[]"),
            sa.Column("price_credits", sa.Integer(), nullable=False),
            sa.Column("purchase_count", sa.Integer(), default=0),
            sa.Column("is_active", sa.Boolean(), default=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()")),
        )

    if not _table_exists(bind, "creator_wallets"):
        op.create_table(
            "creator_wallets",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), unique=True, nullable=False),
            sa.Column("balance_credits", sa.Integer(), default=0),
            sa.Column("lifetime_earned", sa.Integer(), default=0),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()")),
        )

    if not _table_exists(bind, "invoice_requests"):
        op.create_table(
            "invoice_requests",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("order_id", sa.String(64), nullable=False),
            sa.Column("title", sa.String(255), nullable=False),
            sa.Column("tax_id", sa.String(64), nullable=True),
            sa.Column("email", sa.String(255), nullable=False),
            sa.Column("status", sa.String(20), default="pending"),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()")),
        )

    if _table_exists(bind, "challenges"):
        cols = {c["name"] for c in sa.inspect(bind).get_columns("challenges")}
        if "prize_pool_credits" not in cols:
            op.add_column("challenges", sa.Column("prize_pool_credits", sa.Integer(), server_default="0"))
        if "prize_winners" not in cols:
            op.add_column("challenges", sa.Column("prize_winners", sa.Integer(), server_default="3"))


def downgrade() -> None:
    bind = op.get_bind()
    for table in (
        "invoice_requests",
        "creator_wallets",
        "paid_work_packs",
        "recipe_template_purchases",
        "recipe_templates",
        "work_exports",
        "creator_tips",
    ):
        if _table_exists(bind, table):
            op.drop_table(table)
    if _table_exists(bind, "challenges"):
        cols = {c["name"] for c in sa.inspect(bind).get_columns("challenges")}
        if "prize_pool_credits" in cols:
            op.drop_column("challenges", "prize_pool_credits")
        if "prize_winners" in cols:
            op.drop_column("challenges", "prize_winners")
