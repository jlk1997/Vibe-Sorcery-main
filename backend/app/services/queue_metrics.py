"""Queue depth, wait estimates, and compose duration statistics."""

from __future__ import annotations

import json
import logging
import time
import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from sqlalchemy import or_

from app.config import settings
from app.models.schemas import GenerationJob

logger = logging.getLogger(__name__)

_COMPOSE_STATS_KEY = "gen:compose_durations"
_WORKER_CACHE: dict[str, tuple[float, int]] = {}
_QUEUE_DEPTH_CACHE: dict[str, tuple[float, dict[str, int]]] = {}
_CACHE_TTL = 10.0


def _get_redis():
    try:
        import redis

        client = redis.from_url(settings.redis_url, decode_responses=True)
        client.ping()
        return client
    except Exception:
        return None


def _get_broker_redis():
    try:
        import redis

        client = redis.from_url(settings.celery_broker_url, decode_responses=True)
        client.ping()
        return client
    except Exception:
        return None


def queue_name_for_job(job: GenerationJob) -> str:
    cfg = job.config or {}
    return str(cfg.get("_queue") or "celery")


def celery_queue_depths() -> dict[str, int]:
    now = time.monotonic()
    cached = _QUEUE_DEPTH_CACHE.get("all")
    if cached and now - cached[0] < _CACHE_TTL:
        return cached[1]

    depths = {"celery": 0, "priority": 0}
    r = _get_broker_redis()
    if r is not None:
        try:
            for name in ("celery", "priority"):
                depths[name] = int(r.llen(name) or 0)
        except Exception as exc:
            logger.debug("Celery queue depth read failed: %s", exc)

    _QUEUE_DEPTH_CACHE["all"] = (now, depths)
    return depths


def active_worker_count() -> int:
    now = time.monotonic()
    cached = _WORKER_CACHE.get("workers")
    if cached and now - cached[0] < _CACHE_TTL:
        return cached[1]

    count = max(1, int(settings.celery_worker_concurrency or 1))
    try:
        from app.celery_app import celery_app

        inspect = celery_app.control.inspect(timeout=2.0)
        stats = inspect.stats() or {}
        if stats:
            total = 0
            for worker_stats in stats.values():
                pool = worker_stats.get("pool") or {}
                max_conc = pool.get("max-concurrency") or pool.get("max_concurrency") or 1
                total += max(1, int(max_conc))
            count = max(total, len(stats))
        else:
            ping = inspect.ping() or {}
            count = max(len(ping), 1)
    except Exception as exc:
        logger.debug("Celery inspect failed: %s", exc)
        pool = (settings.celery_worker_pool or "solo").lower()
        if pool != "solo":
            count = max(1, int(settings.celery_worker_concurrency or 1))

    _WORKER_CACHE["workers"] = (now, count)
    return count


def generation_capacity_snapshot() -> dict:
    depths = celery_queue_depths()
    workers = active_worker_count()
    avg = average_compose_seconds()
    total_depth = depths.get("celery", 0) + depths.get("priority", 0)
    return {
        "active_workers": workers,
        "generation_slots": workers,
        "celery_depth": depths.get("celery", 0),
        "priority_depth": depths.get("priority", 0),
        "total_broker_depth": total_depth,
        "avg_compose_seconds": avg,
        "estimated_throughput_per_hour": max(1, int((3600 / max(avg, 30)) * workers)),
    }


def record_compose_duration(seconds: float) -> None:
    if seconds <= 0:
        return
    r = _get_redis()
    if r is None:
        return
    try:
        r.lpush(_COMPOSE_STATS_KEY, str(round(seconds, 2)))
        r.ltrim(_COMPOSE_STATS_KEY, 0, settings.compose_stats_window - 1)
    except Exception:
        pass


def average_compose_seconds() -> int:
    r = _get_redis()
    default = settings.default_compose_eta_seconds
    if r is None:
        return default
    try:
        raw = r.lrange(_COMPOSE_STATS_KEY, 0, settings.compose_stats_window - 1)
        if not raw:
            return default
        values = [float(x) for x in raw if x]
        if not values:
            return default
        return max(30, int(sum(values) / len(values)))
    except Exception:
        return default


def count_queue_ahead(db: Session, job: GenerationJob) -> int:
    if job.status != "pending":
        return 0
    qname = queue_name_for_job(job)
    queue_expr = GenerationJob.config["_queue"].astext
    if qname == "celery":
        queue_filter = or_(queue_expr.is_(None), queue_expr == "celery")
    else:
        queue_filter = queue_expr == qname
    return (
        db.query(GenerationJob)
        .filter(
            GenerationJob.status == "pending",
            GenerationJob.created_at < job.created_at,
            queue_filter,
        )
        .count()
    )


def estimate_wait_seconds(queue_ahead: int, queue_name: str) -> int:
    depths = celery_queue_depths()
    depth = depths.get(queue_name, 0)
    workers = max(active_worker_count(), 1)
    avg = average_compose_seconds()
    slots = queue_ahead + depth
    return max(0, int((slots / workers) * avg))


def compute_compose_eta_seconds(job: GenerationJob) -> int | None:
    cfg = job.config or {}
    started_raw = cfg.get("compose_started_at")
    if not started_raw:
        return average_compose_seconds()
    try:
        started = datetime.fromisoformat(str(started_raw))
        elapsed = (datetime.utcnow() - started).total_seconds()
        return max(0, int(average_compose_seconds() - elapsed))
    except ValueError:
        return average_compose_seconds()


def queue_metrics_for_job(db: Session, job: GenerationJob) -> dict:
    qname = queue_name_for_job(job)
    ahead = count_queue_ahead(db, job) if job.status == "pending" else 0
    wait = estimate_wait_seconds(ahead, qname) if job.status == "pending" else None
    compose_eta = None
    if job.status == "running" and (
        job.phase == "composing" or (job.phase and str(job.phase).startswith("track_"))
    ):
        compose_eta = compute_compose_eta_seconds(job)
    return {
        "queue_name": qname,
        "queue_ahead": ahead if job.status == "pending" else None,
        "estimated_wait_seconds": wait,
        "compose_eta_seconds": compose_eta,
        "priority_lane": qname == "priority",
    }


def total_queue_depth() -> int:
    depths = celery_queue_depths()
    return depths.get("celery", 0) + depths.get("priority", 0)


def check_queue_capacity() -> tuple[bool, int]:
    total = total_queue_depth()
    return total < settings.queue_max_depth, total


def pending_status_message(db: Session, job: GenerationJob) -> str:
    metrics = queue_metrics_for_job(db, job)
    ahead = metrics.get("queue_ahead") or 0
    wait = metrics.get("estimated_wait_seconds") or 0
    qname = metrics.get("queue_name") or "celery"
    if ahead <= 0:
        base = "即将开始，正在分配资源…"
    else:
        minutes = max(1, (wait + 59) // 60)
        base = f"前面还有 {ahead} 个任务 · 预计等待约 {minutes} 分钟"
    if qname == "priority":
        return f"{base}（优先通道）"
    return base


def admin_queue_snapshot(db: Session) -> dict:
    from datetime import datetime, timedelta

    from sqlalchemy import func

    pending_count = db.query(GenerationJob).filter(GenerationJob.status == "pending").count()
    running_count = db.query(GenerationJob).filter(GenerationJob.status == "running").count()
    depths = celery_queue_depths()
    since = datetime.utcnow() - timedelta(hours=1)
    failures = (
        db.query(GenerationJob.error_code, func.count(GenerationJob.id))
        .filter(
            GenerationJob.status == "failed",
            GenerationJob.updated_at >= since,
            GenerationJob.error_code.isnot(None),
        )
        .group_by(GenerationJob.error_code)
        .all()
    )
    return {
        "pending_jobs": pending_count,
        "running_jobs": running_count,
        **generation_capacity_snapshot(),
        "queue_max_depth": settings.queue_max_depth,
        "worker_pool": settings.celery_worker_pool,
        "worker_concurrency": settings.celery_worker_concurrency,
        "minimax_max_inflight": settings.minimax_max_inflight,
        "failures_1h_by_code": {code: int(count) for code, count in failures if code},
    }


def record_job_compose_completion(job: GenerationJob) -> None:
    cfg = job.config or {}
    started_raw = cfg.get("compose_started_at")
    if not started_raw:
        return
    try:
        started = datetime.fromisoformat(str(started_raw))
        seconds = (datetime.utcnow() - started).total_seconds()
        record_compose_duration(seconds)
    except ValueError:
        pass
