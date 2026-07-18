"""Add style_presets table."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0002_style_presets"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "style_presets" in insp.get_table_names():
        # 0001_baseline create_all may already create this table from SQLAlchemy models.
        return
    op.create_table(
        "style_presets",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column("category", sa.String(64), server_default="scene"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("example_intent", sa.Text(), nullable=True),
        sa.Column("moods", postgresql.JSONB(), server_default="[]"),
        sa.Column("genres", postgresql.JSONB(), server_default="[]"),
        sa.Column("bpm_range", postgresql.JSONB(), server_default="[80, 120]"),
        sa.Column("key", sa.String(32), server_default="auto"),
        sa.Column("duration_preference", sa.String(32), server_default="medium"),
        sa.Column("default_curve", sa.String(64), server_default="neutral"),
        sa.Column("waypoint_template", postgresql.JSONB(), server_default="[]"),
        sa.Column("instrumental_default", sa.Boolean(), server_default="true"),
        sa.Column("tenant_id", sa.String(64), server_default="default"),
        sa.Column("sort_order", sa.Integer(), server_default="0"),
        sa.Column("enabled", sa.Boolean(), server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_style_presets_category", "style_presets", ["category"])
    op.create_index("ix_style_presets_tenant_id", "style_presets", ["tenant_id"])


def downgrade() -> None:
    op.drop_index("ix_style_presets_tenant_id", table_name="style_presets")
    op.drop_index("ix_style_presets_category", table_name="style_presets")
    op.drop_table("style_presets")
