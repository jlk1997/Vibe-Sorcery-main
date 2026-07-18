"""Redis pub/sub for job status updates (optional WS acceleration)."""

from __future__ import annotations

import json
import logging
import uuid

from sqlalchemy.orm import Session

from app.models.schemas import GenerationJob

logger = logging.getLogger(__name__)

_redis_client = None
_redis_checked = False


def _get_redis():
    global _redis_client, _redis_checked
    if _redis_checked:
        return _redis_client
    _redis_checked = True
    try:
        from app.config import settings
        import redis

        client = redis.from_url(settings.redis_url, decode_responses=True)
        client.ping()
        _redis_client = client
    except Exception as exc:
        logger.debug("Job pub/sub Redis unavailable: %s", exc)
        _redis_client = None
    return _redis_client


def job_payload_dict(job: GenerationJob, db: Session | None = None) -> dict:
    from app.services.queue_metrics import queue_metrics_for_job

    metrics = queue_metrics_for_job(db, job) if db is not None else {}
    if not metrics and db is None:
        cfg = job.config or {}
        qname = cfg.get("_queue") or "celery"
        metrics = {"queue_name": qname, "priority_lane": qname == "priority"}

    return {
        "id": str(job.id),
        "status": job.status,
        "progress": job.progress,
        "current_step": job.current_step,
        "total_steps": job.total_steps,
        "phase": job.phase,
        "result": job.result,
        "error_message": job.error_message,
        "error_code": getattr(job, "error_code", None),
        "status_message": job.status_message,
        "job_type": job.job_type,
        "version": getattr(job, "version", None),
        "queue_ahead": metrics.get("queue_ahead"),
        "estimated_wait_seconds": metrics.get("estimated_wait_seconds"),
        "compose_eta_seconds": metrics.get("compose_eta_seconds"),
        "priority_lane": metrics.get("priority_lane"),
        "remix_source": (
            {
                "work_id": str((job.config or {}).get("seed_work_id")),
                "remix_intent": (job.config or {}).get("remix_intent"),
                "output_title": (job.config or {}).get("title"),
            }
            if job.job_type == "remix" and (job.config or {}).get("seed_work_id")
            else None
        ),
    }


def publish_job_update(job: GenerationJob, db: Session | None = None) -> None:
    r = _get_redis()
    if r is None:
        return
    payload = json.dumps(job_payload_dict(job, db), default=str)
    r.publish(f"job:{job.id}", payload)


def job_channel(job_id: uuid.UUID | str) -> str:
    return f"job:{job_id}"


def subscribe_job_channel(job_id: uuid.UUID | str):
    """Return a Redis pubsub subscribed to job updates, or None if Redis unavailable."""
    r = _get_redis()
    if r is None:
        return None
    pubsub = r.pubsub()
    pubsub.subscribe(job_channel(job_id))
    return pubsub
