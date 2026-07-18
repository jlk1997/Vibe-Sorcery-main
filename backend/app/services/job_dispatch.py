"""Dispatch generation tasks with optional priority queue for subscribers."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.models.schemas import GenerationJob
from app.services.job_errors import QUEUE_OVERLOAD, QUEUE_UNAVAILABLE
from app.services.queue_metrics import check_queue_capacity
from app.services.subscriptions import is_active_subscriber
from app.workers.tasks import (
    generate_cover_task,
    generate_playlist_task,
    generate_single_task,
    generate_variations_task,
)

logger = logging.getLogger(__name__)


def _queue_for_user(db: Session, user_id: uuid.UUID) -> str:
    return "priority" if is_active_subscriber(db, user_id) else "celery"


def _stamp_dispatch_metadata(db: Session, job_id: str, queue_name: str) -> None:
    job = db.query(GenerationJob).filter(GenerationJob.id == uuid.UUID(job_id)).first()
    if not job:
        return
    cfg = dict(job.config or {})
    cfg["_queue"] = queue_name
    cfg["_queued_at"] = datetime.utcnow().isoformat()
    job.config = cfg
    db.commit()


def _store_celery_task_id(db: Session, job_id: str, celery_task_id: str) -> None:
    job = db.query(GenerationJob).filter(GenerationJob.id == uuid.UUID(job_id)).first()
    if not job:
        return
    cfg = dict(job.config or {})
    cfg["_celery_task_id"] = celery_task_id
    job.config = cfg
    db.commit()


def _append_sub_celery_task_id(db: Session, job_id: str, celery_task_id: str) -> None:
    job = db.query(GenerationJob).filter(GenerationJob.id == uuid.UUID(job_id)).first()
    if not job:
        return
    cfg = dict(job.config or {})
    subs = list(cfg.get("_sub_celery_task_ids") or [])
    subs.append(celery_task_id)
    cfg["_sub_celery_task_ids"] = subs
    job.config = cfg
    db.commit()


def _ensure_queue_capacity(db: Session, job_id: str) -> None:
    ok, depth = check_queue_capacity()
    if ok:
        return
    from app.services.job_state import fail_job

    fail_job(
        db,
        job_id,
        error_message="当前生成队列繁忙，请稍后再试",
        error_code=QUEUE_OVERLOAD,
    )
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={
            "code": QUEUE_OVERLOAD,
            "message": "当前生成队列繁忙，请稍后再试",
            "queue_depth": depth,
            "limit": settings.queue_max_depth,
        },
    )


def _safe_apply_async(db: Session, job_id: str, queue_name: str, apply_fn) -> str | None:
    """Queue Celery task; on broker failure mark job failed and refund."""
    try:
        result = apply_fn()
        return result.id
    except Exception:
        logger.exception("Celery dispatch failed for job %s", job_id)
        from app.services.job_state import fail_job

        fail_job(
            db,
            job_id,
            error_message="任务队列不可用，请稍后重试",
            error_code=QUEUE_UNAVAILABLE,
        )
        return None


def _refresh_pending_message(db: Session, job_id: str) -> None:
    from app.services.job_progress import update_job_pending_heartbeat

    job = db.query(GenerationJob).filter(GenerationJob.id == uuid.UUID(job_id)).first()
    if job and job.status == "pending":
        update_job_pending_heartbeat(db, job)


def _dispatch(db: Session, user_id: uuid.UUID, job_id: str, config: dict, apply_fn) -> None:
    _ensure_queue_capacity(db, job_id)
    queue_name = _queue_for_user(db, user_id)
    _stamp_dispatch_metadata(db, job_id, queue_name)
    task_id = _safe_apply_async(
        db,
        job_id,
        queue_name,
        lambda: apply_fn(queue_name),
    )
    if task_id:
        _store_celery_task_id(db, job_id, task_id)
        _refresh_pending_message(db, job_id)


def dispatch_single(db: Session, user_id: uuid.UUID, job_id: str, config: dict) -> None:
    _dispatch(
        db,
        user_id,
        job_id,
        config,
        lambda q: generate_single_task.apply_async(args=[job_id, config], queue=q),
    )


def dispatch_playlist(db: Session, user_id: uuid.UUID, job_id: str, config: dict) -> None:
    _dispatch(
        db,
        user_id,
        job_id,
        config,
        lambda q: generate_playlist_task.apply_async(args=[job_id, config], queue=q),
    )


def dispatch_variations(db: Session, user_id: uuid.UUID, job_id: str, config: dict) -> str | None:
    queue_name = _queue_for_user(db, user_id)
    try:
        _ensure_queue_capacity(db, job_id)
    except HTTPException:
        return None
    _stamp_dispatch_metadata(db, job_id, queue_name)
    task_id = _safe_apply_async(
        db,
        job_id,
        queue_name,
        lambda: generate_variations_task.apply_async(args=[job_id, config], queue=queue_name),
    )
    if task_id:
        _store_celery_task_id(db, job_id, task_id)
        _refresh_pending_message(db, job_id)
    return task_id


def dispatch_cover(db: Session, user_id: uuid.UUID, job_id: str, config: dict) -> None:
    _dispatch(
        db,
        user_id,
        job_id,
        config,
        lambda q: generate_cover_task.apply_async(args=[job_id, config], queue=q),
    )


def dispatch_remix(db: Session, user_id: uuid.UUID, job_id: str, config: dict) -> None:
    dispatch_single(db, user_id, job_id, config)


def store_variation_sub_task(db: Session, parent_job_id: str, sub_job_id: str, celery_task_id: str) -> None:
    job = db.query(GenerationJob).filter(GenerationJob.id == uuid.UUID(parent_job_id)).first()
    if not job:
        return
    cfg = dict(job.config or {})
    sub_ids = list(cfg.get("sub_job_ids") or [])
    if sub_job_id not in sub_ids:
        sub_ids.append(sub_job_id)
    cfg["sub_job_ids"] = sub_ids
    job.config = cfg
    db.commit()
    _append_sub_celery_task_id(db, parent_job_id, celery_task_id)
