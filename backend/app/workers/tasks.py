import asyncio
import hashlib
import logging
import os
import time
import uuid

import httpx
from app.celery_app import celery_app
from app.config import settings
from app.core.emotion_engine import emotion_engine
from app.core.music_prompt_builder import estimate_av_from_moods
from app.core.music_spec_resolver import infer_moods_genres_from_spec, resolve_creative_spec
from app.core.playlist_orchestrator import PlaylistOrchestrator
from app.database import SessionLocal
from app.integrations.minimax.client import minimax_client
from app.integrations.minimax.cover import cover_client
from app.integrations.minimax.music_response import compose_music_prompt
from app.models.schemas import GenerationJob, ProvenanceRecord, User, Work
from app.services.post_process import post_process_work
from app.services.job_progress import (
    composing_progress_heartbeat,
    update_job_phase,
)
from app.services.job_state import (
    complete_at_audio_ready,
    fail_job,
    on_post_process_finished,
    start_running,
    verify_worker_job,
)
from app.services.storage import get_storage_service
from app.services.reference_track import apply_reference_emotion
from app.services.work_access import can_use_work_as_seed
from app.workers.errors import PartialPlaylistError, friendly_generation_error, friendly_generation_error_with_code
from app.services.job_errors import FORBIDDEN, GENERATION_FAILED, NOT_FOUND, PARTIAL_PLAYLIST, VALIDATION
from sqlalchemy.exc import OperationalError

logger = logging.getLogger(__name__)

_GENERATION_AUTORETRY = {
    "autoretry_for": (OperationalError, ConnectionError, OSError),
    "retry_backoff": True,
    "max_retries": 2,
}


def _fail_from_exception(db, job_id: str, exc: Exception, *, partial_result: dict | None = None) -> None:
    if isinstance(exc, (OperationalError, ConnectionError, OSError)):
        raise exc
    code, msg = friendly_generation_error_with_code(exc, partial=partial_result is not None)
    fail_job(db, job_id, error_message=msg, error_code=code, partial_result=partial_result)


def is_job_cancelled(job_id: str) -> bool:
    db = SessionLocal()
    try:
        job = db.query(GenerationJob).filter(GenerationJob.id == uuid.UUID(job_id)).first()
        return bool(job and job.status == "cancelled")
    finally:
        db.close()


def run_async(coro):
    from app.workers.worker_runtime import run_async as _run_async

    return _run_async(coro)


def notify_job_terminal_state(job_id: str) -> None:
    """Notify user webhooks and in-app notifications after terminal job state."""
    from app.services.generation_gate import refund_job_credits_if_needed
    from app.services.job_webhooks import dispatch_job_webhooks
    from app.services.notifications import notify_job_terminal

    db = SessionLocal()
    try:
        job = db.query(GenerationJob).filter(GenerationJob.id == uuid.UUID(job_id)).first()
        if job and job.status in ("completed", "failed", "cancelled"):
            from app.observability.structured_logging import log_generation_job

            charged = (job.config or {}).get("credits_charged")
            log_generation_job(
                job_id=job_id,
                user_id=str(job.owner_id),
                job_type=job.job_type,
                status=job.status,
                credits_charged=int(charged) if charged is not None else None,
                error=job.error_message,
            )
            if job.status in ("failed", "cancelled"):
                refund_job_credits_if_needed(db, job)
                db.refresh(job)
            dispatch_job_webhooks(db, job)
            notify_job_terminal(db, job)
    except Exception:
        logger.exception("Terminal job notification failed for job %s", job_id)
    finally:
        db.close()


@celery_app.task(name="reconcile_stale_pending_jobs_task")
def reconcile_stale_pending_jobs_task():
    """Fail pending jobs that were never dispatched to Celery."""
    from datetime import datetime, timedelta

    from app.services.job_errors import QUEUE_TIMEOUT

    db = SessionLocal()
    try:
        cutoff = datetime.utcnow() - timedelta(minutes=settings.stale_pending_minutes)
        stale = (
            db.query(GenerationJob)
            .filter(
                GenerationJob.status == "pending",
                GenerationJob.created_at < cutoff,
            )
            .limit(100)
            .all()
        )
        from app.services.job_state import fail_job

        count = 0
        for job in stale:
            if not (job.config or {}).get("_celery_task_id"):
                fail_job(
                    db,
                    str(job.id),
                    error_message="任务排队超时，请重试",
                    error_code=QUEUE_TIMEOUT,
                )
                count += 1
        return {"reconciled": count}
    finally:
        db.close()


@celery_app.task(name="pending_jobs_heartbeat_task")
def pending_jobs_heartbeat_task():
    """Refresh queue wait messages for pending jobs."""
    from app.services.job_progress import update_job_pending_heartbeat

    db = SessionLocal()
    try:
        pending = (
            db.query(GenerationJob)
            .filter(GenerationJob.status == "pending")
            .order_by(GenerationJob.created_at.asc())
            .limit(200)
            .all()
        )
        updated = 0
        for job in pending:
            before = job.status_message
            update_job_pending_heartbeat(db, job)
            db.refresh(job)
            if job.status_message != before:
                updated += 1
        return {"checked": len(pending), "updated": updated}
    finally:
        db.close()


@celery_app.task(name="renew_subscriptions_task")
def renew_subscriptions_task():
    from app.services.subscriptions import process_mock_subscription_renewals, remind_expiring_subscriptions

    db = SessionLocal()
    try:
        renewed = process_mock_subscription_renewals(db)
        reminded = remind_expiring_subscriptions(db)
        return {"renewed": renewed, "reminded": reminded}
    finally:
        db.close()


@celery_app.task(name="subscription_expiry_reminder_task")
def subscription_expiry_reminder_task():
    from app.services.subscriptions import remind_subscription_expiry

    db = SessionLocal()
    try:
        sent = remind_subscription_expiry(db, days_before=3)
        return {"reminders_sent": sent}
    finally:
        db.close()


@celery_app.task(name="finalize_pending_deletions_task")
def finalize_pending_deletions_task():
    from app.services.account_deletion import finalize_pending_deletions

    db = SessionLocal()
    try:
        count = finalize_pending_deletions(db)
        return {"finalized": count}
    finally:
        db.close()


@celery_app.task(name="expire_stale_payment_orders_task")
def expire_stale_payment_orders_task():
    from app.services.payment_orders import expire_stale_pending_orders

    db = SessionLocal()
    try:
        count = expire_stale_pending_orders(db)
        return {"expired": count}
    finally:
        db.close()


@celery_app.task(name="deactivate_expired_subscriptions_task")
def deactivate_expired_subscriptions_task():
    from app.services.subscriptions import deactivate_expired_subscriptions

    db = SessionLocal()
    try:
        count = deactivate_expired_subscriptions(db)
        return {"deactivated": count}
    finally:
        db.close()


@celery_app.task(name="finalize_challenges_task")
def finalize_challenges_task():
    from app.services.challenge_awards import finalize_ended_challenges

    db = SessionLocal()
    try:
        count = finalize_ended_challenges(db)
        return {"finalized": count}
    finally:
        db.close()


@celery_app.task(name="settle_duels_task")
def settle_duels_task():
    from app.services.duels import settle_expired_duels

    db = SessionLocal()
    try:
        count = settle_expired_duels(db)
        return {"settled": count}
    finally:
        db.close()


@celery_app.task(name="snapshot_leaderboards_task")
def snapshot_leaderboards_task():
    from app.services.leaderboards import snapshot_all_charts

    db = SessionLocal()
    try:
        count = snapshot_all_charts(db)
        return {"charts": count}
    finally:
        db.close()


@celery_app.task(name="creator_weekly_digest_task")
def creator_weekly_digest_task():
    from app.services.creator_weekly_digest import send_creator_weekly_digests

    db = SessionLocal()
    try:
        sent = send_creator_weekly_digests(db)
        return {"sent": sent}
    finally:
        db.close()


@celery_app.task(name="remind_ending_challenges_task")
def remind_ending_challenges_task():
    from app.services.challenge_reminders import remind_ending_challenges

    db = SessionLocal()
    try:
        sent = remind_ending_challenges(db)
        return {"sent": sent}
    finally:
        db.close()


@celery_app.task(name="deliver_webhook_task")
def deliver_webhook_task(webhook_id: str, job_id: str, event: str):
    from app.services.job_webhooks import deliver_webhook

    return deliver_webhook(webhook_id, job_id, event)


def _fan_out_post_process(
    db,
    job_id: str,
    owner_id: uuid.UUID,
    work_ids: list[str],
    *,
    result: dict | None = None,
    audio_staging: dict[str, str] | None = None,
) -> None:
    """Complete job for the user immediately; run post-process detached in background."""
    merged = dict(result or {})
    merged["post_process_state"] = "pending"
    complete_at_audio_ready(db, job_id, result=merged)
    for wid in work_ids:
        staging_key = (audio_staging or {}).get(wid)
        post_process_work_task.apply_async(
            args=[wid, str(owner_id)],
            kwargs={"staging_key": staging_key, "job_id": job_id},
            queue="post_process",
        )


@celery_app.task(name="post_process_work_task", queue="post_process")
def post_process_work_task(
    work_id: str,
    user_id: str,
    job_id: str | None = None,
    staging_key: str | None = None,
):
    db = SessionLocal()
    try:
        work = db.query(Work).filter(Work.id == uuid.UUID(work_id)).first()
        if not work:
            return
        if str(work.owner_id) != user_id:
            return
        if staging_key:
            content = get_storage_service().get_object_bytes(staging_key)
        else:
            url = work.audio_url
            if work.storage_key:
                url = get_storage_service().get_presigned_url(work.storage_key)
            resp = httpx.get(url, timeout=60)
            resp.raise_for_status()
            content = resp.content
        job_uuid = uuid.UUID(job_id) if job_id else None
        result = run_async(post_process_work(db, work.id, content, job_uuid))
        if staging_key:
            get_storage_service().delete_object(staging_key)
        db.refresh(work)
        if job_id:
            from app.services.job_progress import patch_completed_job_artifacts

            patch_completed_job_artifacts(db, job_id, work)
        if job_id:
            job = db.query(GenerationJob).filter(GenerationJob.id == uuid.UUID(job_id)).first()
            if job and job.status not in ("completed", "failed", "cancelled"):
                db.refresh(work)
                on_post_process_finished(
                    db,
                    job_id,
                    work_patch={
                        "work_id": str(work.id),
                        "audio_url": work.audio_url,
                        "title": work.title,
                        "cover_url": work.cover_url,
                        "hls_url": work.hls_url,
                    },
                )
        return result
    except Exception as exc:
        logger.warning(
            "Post-process failed for work %s (music is still saved): %s",
            work_id,
            friendly_generation_error(exc),
        )
        try:
            work = db.query(Work).filter(Work.id == uuid.UUID(work_id)).first()
            if work:
                pps = dict(work.post_process_status or {})
                pps["state"] = "degraded"
                work.post_process_status = pps
                db.commit()
                if job_id:
                    from app.services.job_progress import patch_completed_job_artifacts

                    patch_completed_job_artifacts(db, job_id, work)
        except Exception:
            db.rollback()
        if job_id:
            db2 = SessionLocal()
            try:
                job = db2.query(GenerationJob).filter(GenerationJob.id == uuid.UUID(job_id)).first()
                if job and job.status not in ("completed", "failed", "cancelled"):
                    work = db2.query(Work).filter(Work.id == uuid.UUID(work_id)).first()
                    patch = {}
                    if work:
                        patch = {
                            "work_id": str(work.id),
                            "audio_url": work.audio_url,
                            "title": work.title,
                        }
                    on_post_process_finished(db2, job_id, work_patch=patch or None, failed=False)
            finally:
                db2.close()
        return {"error": str(exc)}
    finally:
        db.close()


@celery_app.task(name="generate_playlist_task", **_GENERATION_AUTORETRY)
def generate_playlist_task(job_id: str, config: dict):
    db = SessionLocal()
    try:
        job = verify_worker_job(db, job_id, config)
        if is_job_cancelled(job_id):
            return {"cancelled": True}

        seed_bytes = None
        seed_filename = config.get("seed_filename", "seed.wav")

        if config.get("seed_storage_key"):
            url = get_storage_service().get_presigned_url(config["seed_storage_key"])
            resp = httpx.get(url, timeout=60)
            resp.raise_for_status()
            seed_bytes = resp.content
        elif config.get("seed_work_id"):
            work = db.query(Work).filter(Work.id == uuid.UUID(config["seed_work_id"])).first()
            if not work:
                fail_job(db, job_id, error_message="Seed work not found", error_code=NOT_FOUND)
                return
            if not can_use_work_as_seed(work, job.owner_id, db):
                fail_job(db, job_id, error_message="Forbidden seed work", error_code=FORBIDDEN)
                return
            url = work.audio_url
            if work.storage_key:
                url = get_storage_service().get_presigned_url(work.storage_key)
            resp = httpx.get(url, timeout=60)
            resp.raise_for_status()
            seed_bytes = resp.content
            seed_filename = "seed.mp3"

        generation_mode = config.get("generation_mode") or config.get("journey", {}).get("mode", "prompt_journey")
        if seed_bytes is not None:
            if journey := config.get("journey"):
                journey = dict(journey)
                journey["mode"] = "audio_anchor" if generation_mode != "markov" else "markov"
                config = {**config, "journey": journey}
        elif generation_mode in ("markov", "audio_anchor"):
            fail_job(db, job_id, error_message="audio_anchor mode requires seed audio", error_code=VALIDATION)
            return

        creative_spec = run_async(resolve_creative_spec(config))
        anchor_context = {
            "text_intent": config.get("text_intent"),
            "preset_id": config.get("preset_id"),
            "moods": config.get("moods") or creative_spec.moods,
            "genres": config.get("genres") or creative_spec.genres,
            "creative_spec": creative_spec.model_dump(),
        }
        journey = config.get("journey") or {}
        if journey.get("reference"):
            anchor_context["reference_work_id"] = journey["reference"].get("work_id")

        if seed_bytes and generation_mode == "prompt_journey":
            analysis = emotion_engine.analyze_bytes(seed_bytes, suffix=os.path.splitext(seed_filename)[1] or ".wav")
            if not anchor_context["moods"]:
                anchor_context["moods"] = analysis.get("moods") or []
            if not anchor_context["genres"]:
                anchor_context["genres"] = analysis.get("genres") or []

        orchestrator = PlaylistOrchestrator(db, minimax_client)
        result = run_async(
            orchestrator.generate_playlist(
                job=job,
                owner_id=job.owner_id,
                journey_config=config.get("journey", {}),
                music_params=config.get("music_params", {}),
                seed_audio_bytes=seed_bytes if seed_bytes and generation_mode in ("markov", "audio_anchor") else None,
                seed_filename=seed_filename,
                anchor_context=anchor_context,
            )
        )
        if result and result.get("work_ids"):
            _fan_out_post_process(db, job_id, job.owner_id, result["work_ids"], result=result)
        elif not result or not result.get("work_ids"):
            fail_job(db, job_id, error_message="Playlist generation produced no tracks", error_code=GENERATION_FAILED)
        return result
    except PartialPlaylistError as e:
        db.rollback()
        db.expire_all()
        job = db.query(GenerationJob).filter(GenerationJob.id == uuid.UUID(job_id)).first()
        partial = dict(job.result or {}) if job else {}
        for wid in partial.get("work_ids") or []:
            post_process_work_task.apply_async(args=[wid, str(job.owner_id)], queue="post_process")
        fail_job(
            db,
            job_id,
            error_message=friendly_generation_error(e),
            error_code=PARTIAL_PLAYLIST,
            partial_result=partial or None,
        )
        return partial
    except Exception as e:
        db.rollback()
        job = db.query(GenerationJob).filter(GenerationJob.id == uuid.UUID(job_id)).first()
        partial = dict(job.result or {}) if job and (job.result or {}).get("partial") else None
        if partial and partial.get("work_ids"):
            for wid in partial["work_ids"]:
                post_process_work_task.apply_async(args=[wid, str(job.owner_id)], queue="post_process")
        _fail_from_exception(db, job_id, e, partial_result=partial)
        raise
    finally:
        db.close()


@celery_app.task(name="generate_single_task", **_GENERATION_AUTORETRY)
def generate_single_task(job_id: str, config: dict):
    db = SessionLocal()
    try:
        job = verify_worker_job(db, job_id, config)
        if is_job_cancelled(job_id):
            return {"cancelled": True}

        start_running(db, job)
        db.refresh(job)
        update_job_phase(
            db,
            job,
            progress=0.05,
            status_message="任务已排队，准备开始…",
            phase="queued",
        )

        async def _run():
            text_intent = (config.get("text_intent") or "").strip()
            moods = list(config.get("moods") or [])
            genres = list(config.get("genres") or [])
            reference_work_uuid = None
            mock_bytes = b""
            bpm_override = config.get("bpm")
            key_override = config.get("key") or "auto"
            bpm_range = (
                (bpm_override, bpm_override)
                if bpm_override
                else (80, 120)
            )

            if config.get("seed_work_id"):
                work = db.query(Work).filter(Work.id == uuid.UUID(config["seed_work_id"])).first()
                if not work or not can_use_work_as_seed(work, job.owner_id, db):
                    raise RuntimeError("Forbidden or missing seed work")
                audio_url = work.audio_url
                if work.storage_key:
                    audio_url = get_storage_service().get_presigned_url(work.storage_key)
                resp = httpx.get(audio_url, timeout=60)
                mock_bytes = resp.content
                analysis = emotion_engine.analyze_bytes(mock_bytes, ".mp3")
                if not moods:
                    moods = analysis["moods"]
                if not genres:
                    genres = analysis["genres"]
                if not config.get("text_intent"):
                    text_intent = f"{', '.join(moods)} {', '.join(genres)}"

            if config.get("remix_intent"):
                prov = (
                    db.query(ProvenanceRecord)
                    .filter(ProvenanceRecord.work_id == uuid.UUID(config["seed_work_id"]))
                    .first()
                )
                original_prompt = ""
                if prov and prov.music_request:
                    original_prompt = prov.music_request.get("prompt", "")
                remix_intent = (config.get("remix_intent") or "").strip()
                if len(remix_intent) < 30:
                    text_intent = f"{original_prompt or text_intent}, {remix_intent}".strip(", ")
                else:
                    remix_data = await minimax_client.remix_prompt(
                        original_prompt=original_prompt or text_intent,
                        user_intent=remix_intent,
                        db=db,
                        user_id=str(job.owner_id),
                    )
                    text_intent = remix_data.get("prompt", text_intent)
                    if remix_data.get("bpm"):
                        bpm_override = remix_data["bpm"]
                        bpm_range = (bpm_override, bpm_override)
                    if remix_data.get("key"):
                        key_override = remix_data["key"]

            ref_cfg = config.get("reference")
            if ref_cfg and ref_cfg.get("work_id"):
                merged, reference_work_uuid = apply_reference_emotion(
                    db,
                    {"moods": moods, "genres": genres},
                    ref_cfg["work_id"],
                    av_offset=ref_cfg.get("av_offset"),
                )
                moods = merged.get("moods") or moods
                genres = merged.get("genres") or genres

            if not moods and not genres:
                inferred = emotion_engine.infer_from_intent(text_intent)
                moods = inferred.get("moods") or []
                genres = inferred.get("genres") or []

            creative_spec = await resolve_creative_spec(config)
            moods, genres = infer_moods_genres_from_spec(creative_spec, moods, genres)

            if bpm_override:
                creative_spec = creative_spec.model_copy(update={"bpm": bpm_override})
            if key_override and key_override != "auto":
                creative_spec = creative_spec.model_copy(update={"key": key_override})
            if not creative_spec.bpm_range and bpm_range:
                creative_spec = creative_spec.model_copy(update={"bpm_range": [bpm_range[0], bpm_range[1]]})

            update_job_phase(
                db,
                job,
                progress=0.15,
                status_message="正在理解你的创作意图…",
                phase="intent",
            )
            prompt_data = await minimax_client.build_music_prompt(
                moods=moods,
                genres=genres,
                step=1,
                total_steps=1,
                bpm_range=bpm_range,
                key=key_override,
                instrumental=config.get("instrumental", True),
                text_intent=text_intent,
                creative_spec=creative_spec,
                db=db,
                user_id=str(job.owner_id),
            )

            if bpm_override and prompt_data.get("bpm") != bpm_override:
                prompt_data["bpm"] = bpm_override
            if key_override != "auto" and prompt_data.get("key") != key_override:
                prompt_data["key"] = key_override

            lyrics = config.get("lyrics")
            style_tags = config.get("style_tags")
            is_instrumental = config.get("instrumental", True) if not lyrics else False
            lyrics_optimizer = config.get("lyrics_optimizer")
            user_seed = config.get("seed")
            gen_seed = user_seed if user_seed is not None else hash(f"{job.id}") % 1_000_000

            music_prompt = compose_music_prompt(
                style_tags=style_tags,
                built_prompt=prompt_data.get("prompt") if prompt_data.get("source") == "m3_journey" else None,
                text_intent=text_intent,
                bpm=prompt_data.get("bpm"),
                key=prompt_data.get("key"),
                creative_spec=creative_spec,
            )

            from datetime import datetime

            cfg = dict(job.config or {})
            cfg["compose_started_at"] = datetime.utcnow().isoformat()
            job.config = cfg
            db.commit()

            update_job_phase(
                db,
                job,
                progress=0.25,
                status_message="AI 正在作曲，请稍候（约 1–3 分钟）…",
                phase="composing",
            )
            heartbeat_stop = asyncio.Event()
            heartbeat_task = asyncio.create_task(composing_progress_heartbeat(job.id, heartbeat_stop))
            try:
                result = await minimax_client.generate_music(
                    prompt=music_prompt,
                    lyrics=lyrics,
                    is_instrumental=is_instrumental,
                    lyrics_optimizer=lyrics_optimizer,
                    seed=gen_seed,
                    db=db,
                    user_id=str(job.owner_id),
                    mock_audio_bytes=mock_bytes or None,
                )
            finally:
                heartbeat_stop.set()
                heartbeat_task.cancel()
                try:
                    await heartbeat_task
                except asyncio.CancelledError:
                    pass
            if not result.audio_bytes:
                base = (result.metadata.get("response") or {}).get("base_resp") or {}
                detail = base.get("status_msg") or "未返回音频数据"
                raise RuntimeError(f"生成失败：{detail}")

            content_hash = hashlib.sha256(result.audio_bytes).hexdigest()
            update_job_phase(
                db,
                job,
                progress=0.85,
                status_message="正在保存你的作品…",
                phase="saving",
            )
            key = get_storage_service().generate_work_key(str(job.owner_id))
            storage_key, url = get_storage_service().upload_bytes(result.audio_bytes, key)
            parent_id = None
            if config.get("remix_intent") and config.get("seed_work_id"):
                parent_id = uuid.UUID(config["seed_work_id"])

            owner = db.query(User).filter(User.id == job.owner_id).first()
            owner_tenant = owner.tenant_id if owner else settings.default_tenant_id

            work_arousal = creative_spec.arousal
            work_valence = creative_spec.valence
            if work_arousal is None or work_valence is None:
                est_a, est_v = estimate_av_from_moods(moods)
                if work_arousal is None:
                    work_arousal = est_a
                if work_valence is None:
                    work_valence = est_v

            work = Work(
                owner_id=job.owner_id,
                title=config.get("title") or config.get("song_title") or "Generated Track",
                audio_url=url,
                storage_key=storage_key,
                visibility="private",
                content_hash=content_hash,
                parent_work_id=parent_id,
                reference_work_id=reference_work_uuid,
                moods=moods,
                genres=genres,
                arousal=work_arousal,
                valence=work_valence,
                tenant_id=owner_tenant,
            )
            db.add(work)
            db.flush()
            db.add(
                ProvenanceRecord(
                    work_id=work.id,
                    parent_work_id=parent_id,
                    pipeline_version=settings.pipeline_version,
                    step_index=0,
                    record_type="generated",
                    music_request={
                        "prompt": music_prompt,
                        "style_tags": style_tags,
                        "lyrics": lyrics,
                        "seed": gen_seed,
                        "bpm": prompt_data.get("bpm", bpm_override),
                        "key": prompt_data.get("key", key_override),
                        "text_intent": text_intent,
                        "moods": moods,
                        "genres": genres,
                    },
                    output_meta={"sha256": content_hash},
                    job_id=job.id,
                )
            )
            partial_result = {
                "work_id": str(work.id),
                "audio_url": url,
                "title": work.title,
            }
            staging_key = f"staging/post/{work.id}.mp3"
            get_storage_service().upload_bytes(result.audio_bytes, staging_key)
            db.refresh(job)

            if config.get("remix_intent") and config.get("seed_work_id"):
                from app.services.notifications import notify_remix_done

                source = db.query(Work).filter(Work.id == uuid.UUID(config["seed_work_id"])).first()
                remixer = db.query(User).filter(User.id == job.owner_id).first()
                if source and remixer:
                    notify_remix_done(
                        db,
                        source.owner_id,
                        job.owner_id,
                        config["seed_work_id"],
                        str(work.id),
                        remixer.username,
                    )

            _fan_out_post_process(
                db,
                job_id,
                job.owner_id,
                [str(work.id)],
                result=partial_result,
                audio_staging={str(work.id): staging_key},
            )
            return partial_result

        return run_async(_run())
    except Exception as e:
        db.rollback()
        _fail_from_exception(db, job_id, e)
        raise
    finally:
        db.close()


@celery_app.task(name="generate_cover_task", **_GENERATION_AUTORETRY)
def generate_cover_task(job_id: str, config: dict):
    db = SessionLocal()
    try:
        job = verify_worker_job(db, job_id, config)
        start_running(db, job)
        db.refresh(job)

        async def _run():
            work = db.query(Work).filter(Work.id == uuid.UUID(config["work_id"])).first()
            if not work or work.owner_id != job.owner_id:
                raise RuntimeError("Work not found or forbidden")
            ref_url = work.audio_url
            if work.storage_key:
                ref_url = get_storage_service().get_presigned_url(work.storage_key)

            cover_result = await cover_client.generate_cover(
                reference_audio_url=ref_url,
                prompt=config["prompt"],
                lyrics=config.get("lyrics"),
                cover_mode=config.get("cover_mode"),
                modified_lyrics=config.get("modified_lyrics"),
                db=db,
                user_id=str(job.owner_id),
            )

            audio_url = cover_result.get("audio_url") or ref_url
            if cover_result.get("audio_bytes"):
                content = cover_result["audio_bytes"]
            else:
                resp = httpx.get(audio_url, timeout=120)
                resp.raise_for_status()
                content = resp.content
            content_hash = hashlib.sha256(content).hexdigest()
            key = get_storage_service().generate_work_key(str(job.owner_id))
            storage_key, url = get_storage_service().upload_bytes(content, key)
            new_work = Work(
                owner_id=job.owner_id,
                title=f"Cover: {work.title}",
                audio_url=url,
                storage_key=storage_key,
                parent_work_id=work.id,
                content_hash=content_hash,
                moods=work.moods,
                genres=work.genres,
                arousal=work.arousal,
                valence=work.valence,
                visibility="private",
            )
            db.add(new_work)
            db.flush()
            db.add(
                ProvenanceRecord(
                    work_id=new_work.id,
                    parent_work_id=work.id,
                    pipeline_version=settings.pipeline_version,
                    step_index=0,
                    record_type="cover",
                    music_request={"prompt": config["prompt"]},
                    output_meta={"sha256": content_hash},
                    job_id=job.id,
                )
            )
            cover_result_payload = {
                "work_id": str(new_work.id),
                "source_work_id": str(work.id),
                "audio_url": url,
                "title": new_work.title,
            }
            staging_key = f"staging/post/{new_work.id}.mp3"
            get_storage_service().upload_bytes(content, staging_key)
            _fan_out_post_process(
                db,
                job_id,
                job.owner_id,
                [str(new_work.id)],
                result=cover_result_payload,
                audio_staging={str(new_work.id): staging_key},
            )
            return cover_result_payload

        return run_async(_run())
    except Exception as e:
        db.rollback()
        _fail_from_exception(db, job_id, e)
        raise
    finally:
        db.close()


def _ingest_variation_sub_result(
    db,
    *,
    config: dict,
    sub_id: str,
    work_ids: list[str],
    completed_steps: list[dict],
) -> tuple[list[str], list[dict], bool]:
    """Merge a completed variation sub-job into parent aggregates."""
    db.expire_all()
    sub = db.query(GenerationJob).filter(GenerationJob.id == uuid.UUID(sub_id)).first()
    if not (sub and sub.status == "completed" and sub.result and sub.result.get("work_id")):
        return work_ids, completed_steps, False

    wid = sub.result["work_id"]
    if wid in work_ids:
        return work_ids, completed_steps, False

    work_ids = list(work_ids)
    completed_steps = list(completed_steps)
    work_ids.append(wid)
    step_idx = len(work_ids)
    completed_steps.append({
        "work_id": wid,
        "step": step_idx,
        "audio_url": sub.result.get("audio_url"),
        "title": sub.result.get("title") or f"变体 #{step_idx}",
    })
    if config.get("seed_work_id"):
        variant = db.query(Work).filter(Work.id == uuid.UUID(wid)).first()
        if variant and not variant.parent_work_id:
            variant.parent_work_id = uuid.UUID(config["seed_work_id"])
            db.commit()
    return work_ids, completed_steps, True


def _publish_variation_parent_progress(
    db,
    *,
    job_id: str,
    job: GenerationJob,
    work_ids: list[str],
    completed_steps: list[dict],
    total: int,
    progress_label: str,
    phase: str = "composing",
    current_step: int | None = None,
) -> GenerationJob | None:
    done_count = len(work_ids)
    job = db.query(GenerationJob).filter(GenerationJob.id == uuid.UUID(job_id)).first()
    if not job:
        return None
    job.progress = done_count / total if total else 1.0
    job.current_step = current_step if current_step is not None else done_count
    job.status_message = f"{progress_label} {done_count}/{total}"
    job.result = {"work_ids": work_ids, "completed_steps": completed_steps}
    job.phase = phase
    db.commit()
    try:
        from app.services.job_events import publish_job_update

        publish_job_update(job)
    except Exception:
        pass
    return job


def _cancel_variation_parent(db, job_id: str) -> dict:
    from app.services.job_state import transition_job

    transition_job(
        db,
        job_id,
        ("running", "pending"),
        "cancelled",
        error_message="Cancelled by user",
        status_message="已取消",
        phase="cancelled",
    )
    notify_job_terminal_state(job_id)
    return {"cancelled": True}


@celery_app.task(name="generate_variations_task", **_GENERATION_AUTORETRY)
def generate_variations_task(job_id: str, config: dict):
    """Generate variation sub-jobs; parallel apply_async when worker concurrency > 1."""
    db = SessionLocal()
    try:
        job = verify_worker_job(db, job_id, config)
        if is_job_cancelled(job_id):
            return {"cancelled": True}

        start_running(db, job)
        db.refresh(job)

        seeds = config.get("seeds") or [hash(str(job.id) + str(i)) % 1_000_000 for i in range(3)]
        sub_jobs: list[tuple[str, dict]] = []

        for i, seed_val in enumerate(seeds):
            sub_id = str(uuid.uuid4())
            sub_config = {**config, "seed": seed_val, "title": f"{config.get('title', '变体')} #{i + 1}"}
            for k in ("variation_count", "seeds"):
                sub_config.pop(k, None)

            sub_job = GenerationJob(
                id=uuid.UUID(sub_id),
                owner_id=job.owner_id,
                job_type="single",
                status="pending",
                total_steps=1,
                config=sub_config,
            )
            db.add(sub_job)
            sub_jobs.append((sub_id, sub_config))
        db.commit()

        from app.services.job_dispatch import store_variation_sub_task
        from app.workers.worker_runtime import can_parallel_variation_dispatch

        total = len(sub_jobs)
        work_ids: list[str] = []
        completed_steps: list[dict] = []
        preview_pick = bool(config.get("preview_pick_mode"))
        progress_label = "预览方案" if preview_pick else "变体"
        parallel = can_parallel_variation_dispatch()

        update_job_phase(
            db,
            job,
            progress=0.02,
            status_message=f"{progress_label} 0/{total}",
            phase="queued",
            current_step=0,
        )

        if parallel:
            pending: list[tuple[str, dict, object]] = []
            for sub_id, sub_config in sub_jobs:
                async_result = generate_single_task.apply_async(args=[sub_id, sub_config])
                store_variation_sub_task(db, job_id, sub_id, async_result.id)
                pending.append((sub_id, sub_config, async_result))

            while pending:
                if is_job_cancelled(job_id):
                    return _cancel_variation_parent(db, job_id)

                still_pending: list[tuple[str, dict, object]] = []
                for sub_id, sub_config, async_result in pending:
                    if not async_result.ready():
                        still_pending.append((sub_id, sub_config, async_result))
                        continue
                    if not async_result.successful():
                        err = async_result.result
                        raise RuntimeError(f"Variation sub-task {sub_id} failed: {err}")
                    work_ids, completed_steps, _ = _ingest_variation_sub_result(
                        db,
                        config=config,
                        sub_id=sub_id,
                        work_ids=work_ids,
                        completed_steps=completed_steps,
                    )

                pending = still_pending
                job = _publish_variation_parent_progress(
                    db,
                    job_id=job_id,
                    job=job,
                    work_ids=work_ids,
                    completed_steps=completed_steps,
                    total=total,
                    progress_label=progress_label,
                    phase="composing",
                )
                if not job:
                    break
                if pending:
                    time.sleep(2.0)
        else:
            for idx, (sub_id, sub_config) in enumerate(sub_jobs):
                if is_job_cancelled(job_id):
                    return _cancel_variation_parent(db, job_id)

                update_job_phase(
                    db,
                    job,
                    progress=min(0.95, idx / total if total else 0),
                    status_message=f"{progress_label} {idx}/{total} 生成中…",
                    phase="composing",
                    current_step=idx,
                )

                # `.apply()` runs inline on this worker — avoids deadlock when concurrency=1.
                async_result = generate_single_task.apply(args=[sub_id, sub_config])
                store_variation_sub_task(db, job_id, sub_id, async_result.id)

                work_ids, completed_steps, _ = _ingest_variation_sub_result(
                    db,
                    config=config,
                    sub_id=sub_id,
                    work_ids=work_ids,
                    completed_steps=completed_steps,
                )
                job = _publish_variation_parent_progress(
                    db,
                    job_id=job_id,
                    job=job,
                    work_ids=work_ids,
                    completed_steps=completed_steps,
                    total=total,
                    progress_label=progress_label,
                    phase="composing",
                    current_step=idx + 1,
                )
                if not job:
                    break

        if work_ids:
            job = db.query(GenerationJob).filter(GenerationJob.id == uuid.UUID(job_id)).first()
            if job:
                final_result = {
                    "work_ids": work_ids,
                    "completed_steps": completed_steps,
                    "partial": len(work_ids) < total,
                }
                complete_at_audio_ready(
                    db,
                    job_id,
                    result=final_result,
                    status_message="变体生成完成",
                )
        else:
            fail_job(
                db,
                job_id,
                error_message="变体生成失败",
                error_code=GENERATION_FAILED,
                partial_result={"work_ids": work_ids, "completed_steps": completed_steps, "partial": True},
            )
        return {"work_ids": work_ids, "completed_steps": completed_steps}
    except Exception as e:
        db.rollback()
        _fail_from_exception(db, job_id, e)
        raise
    finally:
        db.close()
