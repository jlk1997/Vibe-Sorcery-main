"""Centralized GenerationJob state transitions with row-level locking."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models.schemas import GenerationJob

logger = logging.getLogger(__name__)

ACTIVE_JOB_STATUSES = ("pending", "running", "audio_ready", "post_processing")
TERMINAL_JOB_STATUSES = ("completed", "failed", "cancelled")
NON_TERMINAL_STATUSES = ACTIVE_JOB_STATUSES


class JobTransitionError(Exception):
    """Raised when a job cannot transition to the requested state."""


def get_job_for_update(
    db: Session,
    job_id: uuid.UUID | str,
    *,
    owner_id: uuid.UUID | None = None,
) -> GenerationJob | None:
    try:
        jid = job_id if isinstance(job_id, uuid.UUID) else uuid.UUID(str(job_id))
    except ValueError:
        return None
    q = db.query(GenerationJob).filter(GenerationJob.id == jid).with_for_update()
    if owner_id is not None:
        q = q.filter(GenerationJob.owner_id == owner_id)
    return q.first()


def transition_job(
    db: Session,
    job_id: uuid.UUID | str,
    from_statuses: tuple[str, ...] | list[str],
    to_status: str,
    *,
    owner_id: uuid.UUID | None = None,
    commit: bool = True,
    publish: bool = True,
    **fields: Any,
) -> GenerationJob | None:
    """Atomically move job status when current status is in from_statuses."""
    job = get_job_for_update(db, job_id, owner_id=owner_id)
    if not job:
        return None
    if job.status not in from_statuses:
        return None

    job.status = to_status
    job.updated_at = datetime.utcnow()
    if "version" in fields:
        job.version = fields.pop("version")
    elif hasattr(job, "version") and job.version is not None:
        job.version = int(job.version or 0) + 1

    for key, value in fields.items():
        if hasattr(job, key):
            setattr(job, key, value)

    if commit:
        db.commit()
        db.refresh(job)
        if publish:
            _publish_job_update(job)
    return job


def start_running(db: Session, job: GenerationJob, *, commit: bool = True) -> GenerationJob | None:
    return transition_job(
        db,
        job.id,
        ("pending",),
        "running",
        commit=commit,
        progress=job.progress,
        status_message=job.status_message or "任务已排队，准备开始…",
        phase=job.phase or "queued",
    )


def mark_audio_ready(
    db: Session,
    job_id: uuid.UUID | str,
    *,
    result: dict | None = None,
    progress: float = 0.90,
    status_message: str = "音轨已凝结，正在封印封面与谱系…",
    phase: str = "audio_ready",
) -> GenerationJob | None:
    fields: dict[str, Any] = {
        "progress": progress,
        "status_message": status_message,
        "phase": phase,
    }
    if result is not None:
        fields["result"] = result
    return transition_job(db, job_id, ("running", "pending"), "audio_ready", **fields)


def complete_at_audio_ready(
    db: Session,
    job_id: uuid.UUID | str,
    *,
    result: dict | None = None,
    status_message: str = "炼成完成",
) -> GenerationJob | None:
    """Mark job completed as soon as audio is saved — post-processing continues in background."""
    fields: dict[str, Any] = {
        "progress": 1.0,
        "status_message": status_message,
        "phase": "done",
    }
    if result is not None:
        fields["result"] = result
    job = transition_job(
        db,
        job_id,
        ("running", "pending", "audio_ready", "post_processing"),
        "completed",
        **fields,
    )
    if job:
        from app.services.queue_metrics import record_job_compose_completion

        record_job_compose_completion(job)
        from app.services.job_progress import run_job_completion_side_effects

        run_job_completion_side_effects(db, job, result)
        from app.workers.tasks import notify_job_terminal_state

        notify_job_terminal_state(str(job.id))
    return job


def begin_post_processing(
    db: Session,
    job_id: uuid.UUID | str,
    pending_count: int,
    *,
    result: dict | None = None,
) -> GenerationJob | None:
    """Transition to post_processing and set pending counter."""
    job = get_job_for_update(db, job_id)
    if not job:
        return None
    if job.status not in ("running", "audio_ready", "post_processing"):
        return None

    cfg = dict(job.config or {})
    cfg["post_process_pending"] = max(int(pending_count), 0)
    fields: dict[str, Any] = {
        "config": cfg,
        "status_message": "正在后处理（流媒体/封面/溯源）…",
        "phase": "post_processing",
        "progress": max(job.progress or 0.0, 0.90),
    }
    if hasattr(job, "post_process_pending"):
        fields["post_process_pending"] = pending_count
    if result is not None:
        fields["result"] = result

    return transition_job(db, job_id, ("running", "audio_ready", "post_processing"), "post_processing", **fields)


def _decrement_post_process_pending(job: GenerationJob) -> int:
    cfg = dict(job.config or {})
    pending = int(cfg.get("post_process_pending") or 0)
    if hasattr(job, "post_process_pending") and job.post_process_pending is not None:
        pending = max(int(job.post_process_pending), pending)
    pending = max(pending - 1, 0)
    cfg["post_process_pending"] = pending
    job.config = cfg
    if hasattr(job, "post_process_pending"):
        job.post_process_pending = pending
    return pending


def on_post_process_finished(
    db: Session,
    job_id: uuid.UUID | str,
    *,
    work_patch: dict | None = None,
    failed: bool = False,
    error_message: str | None = None,
) -> GenerationJob | None:
    """Decrement post-process counter; complete or fail job when zero."""
    job = get_job_for_update(db, job_id)
    if not job:
        return None
    if job.status not in ("post_processing", "audio_ready", "running"):
        return None

    if work_patch:
        base = dict(job.result or {})
        base.update(work_patch)
        job.result = base

    remaining = _decrement_post_process_pending(job)
    job.updated_at = datetime.utcnow()

    if remaining > 0:
        db.commit()
        db.refresh(job)
        _publish_job_update(job)
        return job

    if failed:
        job.status = "failed"
        job.error_message = error_message or job.error_message or "Post-processing failed"
        job.status_message = "后处理失败"
        job.phase = "failed"
    else:
        job.status = "completed"
        job.progress = 1.0
        job.phase = "done"
        job.status_message = "炼成完成"

    if hasattr(job, "version"):
        job.version = int(job.version or 0) + 1

    db.commit()
    db.refresh(job)
    _publish_job_update(job)

    if job.status in TERMINAL_JOB_STATUSES:
        from app.workers.tasks import notify_job_terminal_state

        notify_job_terminal_state(str(job.id))

    return job


def fail_job(
    db: Session,
    job_id: uuid.UUID | str,
    *,
    error_message: str,
    error_code: str | None = None,
    owner_id: uuid.UUID | None = None,
    partial_result: dict | None = None,
) -> GenerationJob | None:
    from app.services.job_errors import classify_error_message, log_job_failure

    code = error_code or classify_error_message(error_message, partial=partial_result is not None)
    fields: dict[str, Any] = {
        "error_message": error_message,
        "error_code": code,
        "status_message": "生成失败",
        "phase": "failed",
    }
    if partial_result is not None:
        fields["result"] = partial_result
    job = transition_job(
        db,
        job_id,
        ACTIVE_JOB_STATUSES,
        "failed",
        owner_id=owner_id,
        **fields,
    )
    if job:
        log_job_failure(logger, str(job.id), code, error_message)
        if code == "MINIMAX_BALANCE":
            logger.error("MiniMax account balance exhausted — admin action required")
        from app.workers.tasks import notify_job_terminal_state

        notify_job_terminal_state(str(job.id))
    return job


def cancel_job_state(
    db: Session,
    job: GenerationJob,
    *,
    revoke_celery: bool = True,
) -> GenerationJob:
    """Mark job cancelled and revoke associated Celery tasks."""
    _cancel_sub_jobs(db, job)
    transition_job(
        db,
        job.id,
        ACTIVE_JOB_STATUSES,
        "cancelled",
        error_message="Cancelled by user",
        status_message="已取消",
        phase="cancelled",
    )
    db.refresh(job)

    if revoke_celery:
        _revoke_job_tasks(job)

    from app.workers.tasks import notify_job_terminal_state

    notify_job_terminal_state(str(job.id))
    return job


def _cancel_sub_jobs(db: Session, job: GenerationJob) -> None:
    """Cancel variation child jobs when parent is cancelled."""
    cfg = job.config or {}
    for sub_id in cfg.get("sub_job_ids") or []:
        try:
            sub_uuid = uuid.UUID(str(sub_id))
        except ValueError:
            continue
        sub = get_job_for_update(db, sub_uuid)
        if not sub or sub.status not in ACTIVE_JOB_STATUSES:
            continue
        transition_job(
            db,
            sub.id,
            ACTIVE_JOB_STATUSES,
            "cancelled",
            error_message="Cancelled by parent job",
            status_message="已取消",
            phase="cancelled",
            publish=False,
        )
        _revoke_job_tasks(sub)


def _revoke_job_tasks(job: GenerationJob) -> None:
    from app.celery_app import celery_app

    cfg = job.config or {}
    task_ids: list[str] = []
    if tid := cfg.get("_celery_task_id"):
        task_ids.append(str(tid))
    for tid in cfg.get("_sub_celery_task_ids") or []:
        task_ids.append(str(tid))

    for tid in task_ids:
        try:
            celery_app.control.revoke(tid, terminate=True, signal="SIGTERM")
        except Exception:
            logger.warning("Failed to revoke celery task %s for job %s", tid, job.id)


def verify_worker_job(
    db: Session,
    job_id: str,
    config: dict,
) -> GenerationJob:
    """Ensure worker task args match job owner (dispatch writes config._owner_id)."""
    job = db.query(GenerationJob).filter(GenerationJob.id == uuid.UUID(job_id)).first()
    if not job:
        raise RuntimeError("Job not found")
    expected = config.get("_owner_id")
    if expected and str(job.owner_id) != str(expected):
        raise RuntimeError("Job owner mismatch")
    return job


def _publish_job_update(job: GenerationJob) -> None:
    try:
        from app.database import SessionLocal
        from app.services.job_events import publish_job_update

        db = SessionLocal()
        try:
            publish_job_update(job, db)
        finally:
            db.close()
    except Exception:
        logger.debug("Job pub/sub publish skipped for %s", job.id, exc_info=True)
