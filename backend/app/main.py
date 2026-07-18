from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
import logging

from app.api.router import api_router
from app.config import settings
from app.database import SessionLocal, engine
from app.health import collect_health
from app.models.schemas import Challenge, FeatureFlag, Tenant, User
from app.core.style_presets import seed_builtin_presets
from app.migrations import run_migrations
from app.db_migrate import run_alembic_upgrade
from app.startup_checks import validate_production_config

log = logging.getLogger("vibe.startup")

app = FastAPI(title=settings.app_name, version=settings.app_version)
app.add_middleware(GZipMiddleware, minimum_size=500)

if settings.metrics_enabled:
    from app.observability.metrics import MetricsMiddleware

    app.add_middleware(MetricsMiddleware)

from app.observability.request_id import RequestIdMiddleware

app.add_middleware(RequestIdMiddleware)

if settings.sentry_dsn:
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration

        sentry_sdk.init(dsn=settings.sentry_dsn, integrations=[FastApiIntegration()], traces_sample_rate=0.1)
    except Exception as exc:
        log.warning("Sentry init failed: %s", exc)

_cors_kwargs: dict = {
    "allow_origins": settings.cors_origin_list,
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}
# 开发模式：允许 localhost / 127.0.0.1 / 局域网 IP 任意端口（Taro H5 dev 10086 等）
if settings.debug:
    _cors_kwargs["allow_origin_regex"] = (
        r"http://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?"
    )

app.add_middleware(CORSMiddleware, **_cors_kwargs)


def seed_platform_defaults():
    db = SessionLocal()
    try:
        flags = [
            ("music_cover", settings.music_cover_enabled, "Enable AI cover generation during post-process"),
            ("hls_streaming", True, "Enable HLS transcoding"),
            ("c2pa_provenance", settings.c2pa_enabled, "Enable C2PA manifests"),
            ("personalized_feed", True, "Enable embedding-based feed ranking"),
            (
                "credits_gate",
                settings.credits_gate_enabled,
                "Enable generation credits gate (402 when insufficient)",
            ),
            ("multi_tenant", False, "Enable tenant_id isolation on feed and works"),
        ]
        for key, enabled, desc in flags:
            row = db.query(FeatureFlag).filter(FeatureFlag.key == key).first()
            if not row:
                db.add(FeatureFlag(key=key, enabled=enabled, description=desc))
            elif key == "credits_gate" and settings.credits_gate_enabled and not row.enabled:
                row.enabled = True
            elif key == "music_cover" and settings.music_cover_enabled and not row.enabled:
                row.enabled = True
        if not db.query(Challenge).filter(Challenge.slug == "calm-to-chaos").first():
            db.add(Challenge(
                slug="calm-to-chaos",
                title="Calm to Chaos 情绪挑战",
                description="从平静到混沌，用 6 首作品讲述你的情绪旅程",
                hashtag="CalmToChaos",
                target_curve="calm_to_energy",
            ))
        if settings.admin_bootstrap_email.strip():
            bootstrap_email = settings.admin_bootstrap_email.strip().lower()
            if not db.query(User).filter(User.is_admin == True).first():
                candidate = db.query(User).filter(User.email == bootstrap_email).first()
                if candidate and not candidate.is_admin:
                    candidate.is_admin = True
        if not db.query(Tenant).filter(Tenant.id == settings.default_tenant_id).first():
            db.add(Tenant(id=settings.default_tenant_id, name="Default", plan="free"))
        seed_builtin_presets(db)
        from app.services.content_moderation import seed_default_words

        seed_default_words(db)
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


def _ensure_pgvector():
    from sqlalchemy import text

    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))


def _startup_progress(msg: str) -> None:
    """Visible during Alembic fileConfig (root logger may be WARN)."""
    print(f"[vibe.startup] {msg}", flush=True)
    log.info(msg)


def run_startup_tasks() -> None:
    _startup_progress("Validating config…")
    validate_production_config()
    _startup_progress("Ensuring pgvector extension…")
    _ensure_pgvector()
    if settings.run_alembic_on_startup:
        _startup_progress("Running Alembic migrations…")
        run_alembic_upgrade()
    else:
        _startup_progress("Skipping Alembic on startup (RUN_ALEMBIC_ON_STARTUP=false)")
    _startup_progress("Running legacy column backfill…")
    run_migrations()
    _startup_progress("Seeding platform defaults…")
    seed_platform_defaults()
    _startup_progress("Application startup complete.")


@app.on_event("startup")
def startup():
    run_startup_tasks()


@app.get("/health")
@app.get("/api/v1/health")
def health():
    return collect_health()


@app.get("/health/worker")
@app.get("/api/v1/health/worker")
def health_worker():
    from app.health import collect_worker_health

    return collect_worker_health()


@app.get("/metrics")
def metrics():
    from fastapi.responses import PlainTextResponse
    from app.observability.metrics import prometheus_text

    return PlainTextResponse(prometheus_text(), media_type="text/plain; version=0.0.4")


app.include_router(api_router, prefix=settings.api_prefix)
