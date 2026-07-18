"""Extended health checks for load balancers and ops."""

from __future__ import annotations

from pathlib import Path

from sqlalchemy import text

from app.config import settings
from app.database import engine

_ESSENTIA_MODEL_HINTS = (
    "discogs-effnet-bs64-1.pb",
    "mtg_jamendo_moodtheme-discogs-effnet-1.pb",
)


def _check_database() -> dict:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok"}
    except Exception as exc:
        detail = str(exc)[:200] if settings.debug else "unavailable"
        return {"status": "error", "detail": detail}


def _check_redis() -> dict:
    try:
        import redis

        client = redis.from_url(settings.redis_url, socket_connect_timeout=2)
        client.ping()
        return {"status": "ok"}
    except Exception as exc:
        detail = str(exc)[:200] if settings.debug else "unavailable"
        return {"status": "error", "detail": detail}


def _check_essentia_models() -> dict:
    models_dir = Path(settings.models_dir)
    if not models_dir.is_dir():
        return {"status": "degraded", "detail": "models_dir missing — emotion analysis may fallback"}
    found = [name for name in _ESSENTIA_MODEL_HINTS if (models_dir / name).exists()]
    if len(found) >= 2:
        return {"status": "ok", "models_found": len(found)}
    return {
        "status": "degraded",
        "detail": "Essentia models incomplete — install per README",
        "models_found": len(found),
    }


def collect_health() -> dict:
    checks = {
        "database": _check_database(),
        "redis": _check_redis(),
        "essentia_models": _check_essentia_models(),
    }
    statuses = {row["status"] for row in checks.values()}
    if "error" in statuses:
        overall = "error"
    elif "degraded" in statuses:
        overall = "degraded"
    else:
        overall = "ok"
    return {
        "status": overall,
        "version": settings.app_version,
        **({"debug": settings.debug} if settings.debug else {}),
        "checks": checks,
    }


def collect_worker_health() -> dict:
    """Celery worker + queue depth probe for ops and local dev diagnostics."""
    from app.services.queue_metrics import (
        active_worker_count,
        celery_queue_depths,
        generation_capacity_snapshot,
    )

    depths = celery_queue_depths()
    workers = active_worker_count()
    total_depth = depths.get("celery", 0) + depths.get("priority", 0)
    capacity = generation_capacity_snapshot()
    if workers <= 0:
        status = "error"
        detail = "No Celery workers detected — start run-worker.ps1 locally"
    elif total_depth > 50:
        status = "degraded"
        detail = f"Queue backlog: {total_depth} tasks waiting"
    else:
        status = "ok"
        detail = None
    return {
        "status": status,
        "active_workers": workers,
        "total_broker_depth": total_depth,
        **capacity,
        **({"detail": detail} if detail else {}),
    }
