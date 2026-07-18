"""Shared helpers for creating generation jobs."""

from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.models.schemas import GenerationJob, User
from app.services.active_job_limit import enforce_active_job_limit
from app.services.idempotency import find_idempotent_job, parse_idempotency_key, record_idempotency_key


def owner_tenant_id(user: User) -> str:
    return user.tenant_id or settings.default_tenant_id


def stamp_dispatch_config(config: dict, user_id: uuid.UUID) -> dict:
    merged = dict(config)
    merged["_owner_id"] = str(user_id)
    return merged


def lookup_idempotent_job(
    db: Session,
    user: User,
    idempotency_key: str | None,
) -> GenerationJob | None:
    key = parse_idempotency_key(idempotency_key)
    if not key:
        return None
    return find_idempotent_job(db, user.id, key)


def create_generation_job(
    db: Session,
    user: User,
    *,
    job_type: str,
    config: dict,
    total_steps: int = 1,
    status_message: str = "等待处理中…",
    idempotency_key: str | None = None,
) -> GenerationJob:
    """Enforce active-job limit, insert job, optionally record idempotency key."""
    enforce_active_job_limit(db, user)
    key = parse_idempotency_key(idempotency_key)

    job = GenerationJob(
        owner_id=user.id,
        tenant_id=owner_tenant_id(user),
        job_type=job_type,
        status="pending",
        total_steps=total_steps,
        status_message=status_message,
        config=stamp_dispatch_config(config, user.id),
        idempotency_key=key,
    )
    db.add(job)
    db.flush()

    if key:
        if not record_idempotency_key(db, user.id, key, job.id):
            existing = find_idempotent_job(db, user.id, key)
            if existing:
                db.rollback()
                return existing
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Idempotency-Key conflict; retry with the same key",
            )

    db.commit()
    db.refresh(job)
    return job
