"""Lightweight schema migration for dev — adds Phase 3 columns if missing.

DEPRECATED: prefer `alembic upgrade head`. Kept for one release to backfill columns
on databases that predate Alembic revisions.
"""
from sqlalchemy import inspect, text
from app.database import engine


MIGRATIONS = [
    ("users", "is_admin", "BOOLEAN DEFAULT FALSE"),
    ("users", "tenant_id", "VARCHAR(64) DEFAULT 'default'"),
    ("works", "storage_key", "VARCHAR(512)"),
    ("works", "cover_storage_key", "VARCHAR(512)"),
    ("works", "hls_url", "VARCHAR(512)"),
    ("works", "hls_storage_prefix", "VARCHAR(512)"),
    ("works", "tenant_id", "VARCHAR(64) DEFAULT 'default'"),
    ("posts", "tenant_id", "VARCHAR(64) DEFAULT 'default'"),
    ("posts", "challenge_id", "UUID"),
    ("provenance_records", "c2pa_manifest", "JSONB"),
    ("provenance_records", "blockchain_tx_hash", "VARCHAR(128)"),
    ("generation_jobs", "status_message", "TEXT"),
    ("generation_jobs", "phase", "VARCHAR(32)"),
    ("works", "preset_id", "VARCHAR(64)"),
    ("works", "reference_work_id", "UUID"),
    ("works", "allow_remix", "BOOLEAN DEFAULT TRUE"),
    ("works", "license", "VARCHAR(64) DEFAULT 'allow_remix'"),
    ("works", "post_process_status", "JSONB DEFAULT '{}'::jsonb"),
    ("user_api_keys", "scopes", "JSONB DEFAULT '[\"read\", \"generate\"]'::jsonb"),
    ("credit_transactions", "external_id", "VARCHAR(255)"),
    ("users", "is_tenant_admin", "BOOLEAN DEFAULT FALSE"),
    ("users", "referral_code", "VARCHAR(12)"),
    ("users", "referred_by_id", "UUID"),
    ("users", "terms_accepted_at", "TIMESTAMP"),
    ("users", "terms_version", "VARCHAR(32)"),
    ("users", "privacy_accepted_at", "TIMESTAMP"),
    ("users", "privacy_version", "VARCHAR(32)"),
    ("users", "ai_notice_accepted_at", "TIMESTAMP"),
    ("users", "wechat_privacy_authorized_at", "TIMESTAMP"),
    ("users", "analytics_consent", "BOOLEAN DEFAULT FALSE"),
    ("users", "deleted_at", "TIMESTAMP"),
    ("users", "deletion_scheduled_at", "TIMESTAMP"),
    ("works", "is_ai_generated", "BOOLEAN DEFAULT TRUE"),
    ("posts", "consent_at", "TIMESTAMP"),
    ("payment_orders", "payment_terms_version", "VARCHAR(32)"),
    ("payment_orders", "expires_at", "TIMESTAMP"),
    ("user_subscriptions", "plan_id", "VARCHAR(64)"),
    ("user_subscriptions", "channel", "VARCHAR(32)"),
    ("user_subscriptions", "cancel_at_period_end", "BOOLEAN DEFAULT FALSE"),
    ("user_subscriptions", "stripe_customer_id", "VARCHAR(255)"),
]


def run_migrations():
    inspector = inspect(engine)
    existing_tables = inspector.get_table_names()
    with engine.connect() as conn:
        for table, column, col_type in MIGRATIONS:
            if table not in existing_tables:
                continue
            existing_cols = {c["name"] for c in inspector.get_columns(table)}
            if column in existing_cols:
                continue
            try:
                conn.execute(text(f'ALTER TABLE "{table}" ADD COLUMN IF NOT EXISTS {column} {col_type}'))
                conn.commit()
            except Exception:
                conn.rollback()

        if "credit_transactions" in existing_tables:
            try:
                conn.execute(
                    text(
                        "CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_tx_external_id "
                        "ON credit_transactions (external_id) WHERE external_id IS NOT NULL"
                    )
                )
                conn.commit()
            except Exception:
                conn.rollback()
        if "playlist_tracks" in existing_tables:
            try:
                conn.execute(
                    text("CREATE INDEX IF NOT EXISTS ix_playlist_tracks_playlist_id ON playlist_tracks (playlist_id)")
                )
                conn.commit()
            except Exception:
                conn.rollback()
        if "payment_orders" in existing_tables:
            try:
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS ix_payment_orders_status_paid_at "
                        "ON payment_orders (status, paid_at)"
                    )
                )
                conn.commit()
            except Exception:
                conn.rollback()
