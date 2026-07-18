"""User-configured webhooks for generation job terminal events."""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import secrets
import uuid
from datetime import datetime
from typing import Any

import httpx

from app.models.schemas import GenerationJob, UserWebhook

from app.services.url_safety import assert_safe_webhook_url

logger = logging.getLogger(__name__)

ALLOWED_EVENTS = frozenset({"job.completed", "job.failed", "job.cancelled"})
DEFAULT_EVENTS = ["job.completed", "job.failed"]
MAX_WEBHOOKS_PER_USER = 10


def _validate_url(url: str) -> str:
    return assert_safe_webhook_url(url)


def create_webhook(
    db,
    user_id: uuid.UUID,
    *,
    name: str,
    url: str,
    events: list[str] | None = None,
) -> tuple[str, UserWebhook]:
    existing = (
        db.query(UserWebhook)
        .filter(UserWebhook.user_id == user_id)
        .count()
    )
    if existing >= MAX_WEBHOOKS_PER_USER:
        raise ValueError(f"Maximum {MAX_WEBHOOKS_PER_USER} webhooks per user")
    clean_url = _validate_url(url)
    chosen = events or list(DEFAULT_EVENTS)
    for ev in chosen:
        if ev not in ALLOWED_EVENTS:
            raise ValueError(f"Unsupported event: {ev}")
    secret = secrets.token_hex(24)
    row = UserWebhook(
        user_id=user_id,
        name=name.strip() or "Default",
        url=clean_url,
        secret=secret,
        events=chosen,
        enabled=True,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return secret, row


def list_webhooks(db, user_id: uuid.UUID) -> list[UserWebhook]:
    return (
        db.query(UserWebhook)
        .filter(UserWebhook.user_id == user_id)
        .order_by(UserWebhook.created_at.desc())
        .all()
    )


def delete_webhook(db, user_id: uuid.UUID, webhook_id: uuid.UUID) -> bool:
    row = (
        db.query(UserWebhook)
        .filter(UserWebhook.id == webhook_id, UserWebhook.user_id == user_id)
        .first()
    )
    if not row:
        return False
    db.delete(row)
    db.commit()
    return True


def _job_payload(job: GenerationJob, event: str) -> dict[str, Any]:
    return {
        "event": event,
        "job": {
            "id": str(job.id),
            "type": job.job_type,
            "status": job.status,
            "progress": job.progress,
            "current_step": job.current_step,
            "total_steps": job.total_steps,
            "result": job.result,
            "error_message": job.error_message,
            "status_message": job.status_message,
        },
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }


def dispatch_job_webhooks(db, job: GenerationJob) -> None:
    """Queue Celery deliveries for matching user webhooks."""
    if job.status not in ("completed", "failed", "cancelled"):
        return
    event = f"job.{job.status}"
    hooks = (
        db.query(UserWebhook)
        .filter(UserWebhook.user_id == job.owner_id, UserWebhook.enabled == True)
        .all()
    )
    for hook in hooks:
        subscribed = hook.events or list(DEFAULT_EVENTS)
        if event not in subscribed:
            continue
        from app.workers.tasks import deliver_webhook_task

        deliver_webhook_task.delay(str(hook.id), str(job.id), event)


def deliver_webhook(webhook_id: str, job_id: str, event: str) -> dict[str, Any]:
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        hook = db.query(UserWebhook).filter(UserWebhook.id == uuid.UUID(webhook_id)).first()
        job = db.query(GenerationJob).filter(GenerationJob.id == uuid.UUID(job_id)).first()
        if not hook or not job or not hook.enabled:
            return {"skipped": True}
        if job.owner_id != hook.user_id:
            logger.warning("Webhook %s job owner mismatch for job %s", hook.id, job.id)
            return {"skipped": True, "reason": "owner_mismatch"}

        body = _job_payload(job, event)
        raw = json.dumps(body, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        headers = {"Content-Type": "application/json", "User-Agent": "VibeSorcery-Webhook/1.0"}
        if hook.secret:
            sig = hmac.new(hook.secret.encode("utf-8"), raw, hashlib.sha256).hexdigest()
            headers["X-Vibe-Signature"] = f"sha256={sig}"

        try:
            resp = httpx.post(
                hook.url,
                content=raw,
                headers=headers,
                timeout=10.0,
                follow_redirects=False,
            )
            hook.last_delivery_at = datetime.utcnow()
            if resp.status_code >= 400:
                hook.last_error = f"HTTP {resp.status_code}"
            else:
                hook.last_error = None
            db.commit()
            return {"status_code": resp.status_code}
        except Exception as exc:
            hook.last_error = str(exc)[:500]
            db.commit()
            logger.warning("Webhook delivery failed %s -> %s: %s", hook.id, hook.url, exc)
            return {"error": str(exc)}
    finally:
        db.close()
