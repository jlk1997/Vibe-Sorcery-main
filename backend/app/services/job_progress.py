import asyncio
import uuid

from sqlalchemy.orm import Session

from app.api.schemas import JobResponse, RemixSourceResponse
from app.database import SessionLocal
from app.models.schemas import GenerationJob, Work


def job_to_response(
    job: GenerationJob,
    db: Session | None = None,
    *,
    credits_balance: int | None = None,
    task_reward: dict | None = None,
) -> JobResponse:
    remix_source = None
    if job.job_type == "remix":
        cfg = job.config or {}
        seed_id = cfg.get("seed_work_id")
        if seed_id:
            remix_source = RemixSourceResponse(
                work_id=str(seed_id),
                remix_intent=cfg.get("remix_intent"),
                output_title=cfg.get("title"),
            )

    metrics: dict = {}
    if db is not None:
        from app.services.queue_metrics import queue_metrics_for_job

        metrics = queue_metrics_for_job(db, job)

    return JobResponse(
        id=str(job.id),
        status=job.status,
        progress=job.progress,
        current_step=job.current_step,
        total_steps=job.total_steps,
        phase=job.phase,
        result=job.result,
        error_message=job.error_message,
        error_code=getattr(job, "error_code", None),
        status_message=job.status_message,
        job_type=job.job_type,
        remix_source=remix_source,
        credits_balance=credits_balance,
        task_reward=task_reward,
        version=getattr(job, "version", 1) or 1,
        queue_ahead=metrics.get("queue_ahead"),
        estimated_wait_seconds=metrics.get("estimated_wait_seconds"),
        compose_eta_seconds=metrics.get("compose_eta_seconds"),
        priority_lane=metrics.get("priority_lane"),
    )


def job_response_with_credits(
    db: Session,
    job: GenerationJob,
    user_id,
    *,
    task_result: dict | None = None,
) -> JobResponse:
    from app.services.credits import credits_snapshot
    import uuid as _uuid

    uid = user_id if isinstance(user_id, _uuid.UUID) else _uuid.UUID(str(user_id))
    snap = credits_snapshot(db, uid, task_result=task_result)
    return job_to_response(
        job,
        db,
        credits_balance=snap["credits_balance"],
        task_reward=snap.get("task_reward"),
    )


def update_job_pending_heartbeat(db: Session, job: GenerationJob) -> None:
    """Refresh pending queue status message for waiting jobs."""
    from app.services.queue_metrics import pending_status_message

    if job.status != "pending":
        return
    msg = pending_status_message(db, job)
    if job.status_message == msg:
        return
    update_job_phase(db, job, progress=job.progress or 0.0, status_message=msg, phase=job.phase or "queued")


def update_job_phase(
    db: Session,
    job: GenerationJob,
    *,
    progress: float,
    status_message: str,
    current_step: int | None = None,
    phase: str | None = None,
) -> None:
    from datetime import datetime

    job.progress = progress
    job.status_message = status_message
    if current_step is not None:
        job.current_step = current_step
    if phase is not None:
        job.phase = phase
    if hasattr(job, "version"):
        job.version = int(job.version or 0) + 1
    job.updated_at = datetime.utcnow()
    db.commit()
    try:
        from app.services.job_events import publish_job_update

        publish_job_update(job, db)
    except Exception:
        pass


def patch_completed_job_artifacts(db: Session, job_id: str | uuid.UUID, work: Work) -> None:
    """Push post-process results (cover/HLS/state) to an already-completed job."""
    try:
        jid = job_id if isinstance(job_id, uuid.UUID) else uuid.UUID(str(job_id))
    except ValueError:
        return
    job = db.query(GenerationJob).filter(GenerationJob.id == jid).first()
    if not job or job.status != "completed":
        return
    result = dict(job.result or {})
    pps = work.post_process_status or {}
    result["post_process_state"] = pps.get("state", "ready")
    if work.cover_url:
        result["cover_url"] = work.cover_url
    if work.hls_url:
        result["hls_url"] = work.hls_url
    job.result = result
    if hasattr(job, "version"):
        job.version = int(job.version or 0) + 1
    from datetime import datetime

    job.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(job)
    try:
        from app.services.job_events import publish_job_update

        publish_job_update(job, db)
    except Exception:
        pass


async def composing_progress_heartbeat(job_id: uuid.UUID, stop_event: asyncio.Event) -> None:
    """Creep progress during long MiniMax compose calls so the UI does not look stuck."""
    progress = 0.30
    while not stop_event.is_set():
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=15.0)
            break
        except asyncio.TimeoutError:
            pass
        if stop_event.is_set():
            break
        db = SessionLocal()
        try:
            job = db.query(GenerationJob).filter(GenerationJob.id == job_id).first()
            if not job or job.status != "running" or job.phase != "composing":
                break
            progress = min(0.78, progress + 0.04)
            update_job_phase(
                db,
                job,
                progress=progress,
                status_message=job.status_message or "AI 正在作曲，请稍候（约 1–3 分钟）…",
                phase="composing",
            )
        finally:
            db.close()


def run_job_completion_side_effects(db: Session, job: GenerationJob, result: dict | None) -> None:
    """Notifications, emotion calendar, and engagement hooks after job completes."""
    try:
        from app.services.wechat_subscribe import try_notify_job_complete

        title = None
        if isinstance(result, dict):
            title = result.get("title") or (
                result.get("completed_steps") and result["completed_steps"][0].get("title")
            )
        try_notify_job_complete(db, job.owner_id, work_title=title)
        try:
            from app.services.emotion_calendar import log_entry

            wid = None
            if isinstance(result, dict):
                wid = result.get("work_id") or (result.get("work_ids") or [None])[0]
            if wid:
                log_entry(db, job.owner_id, work_id=str(wid))
        except Exception:
            pass
        if job.job_type == "playlist":
            try:
                from app.services.user_engagement import complete_weekly_task

                complete_weekly_task(db, job.owner_id, "weekly_journey_1")
            except Exception:
                pass
    except Exception:
        pass


def complete_job(db: Session, job: GenerationJob, *, result: dict | None = None) -> None:
    job.status = "completed"
    job.progress = 1.0
    job.phase = "done"
    job.status_message = "炼成完成"
    if result is not None:
        job.result = result
    db.commit()
    run_job_completion_side_effects(db, job, result)
