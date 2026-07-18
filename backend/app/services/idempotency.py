"""Client Idempotency-Key handling for generation endpoints."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from typing import Callable

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.schemas import GenerationIdempotencyKey, GenerationJob, User

IDEMPOTENCY_TTL_HOURS = 24


def parse_idempotency_key(raw: str | None) -> str | None:
    if not raw or not raw.strip():
        return None
    key = raw.strip()
    if len(key) > 128:
        raise HTTPException(status_code=400, detail="Idempotency-Key too long (max 128)")
    try:
        uuid.UUID(key)
    except ValueError:
        pass
    return key


def find_idempotent_job(db: Session, user_id: uuid.UUID, key: str) -> GenerationJob | None:
    cutoff = datetime.utcnow() - timedelta(hours=IDEMPOTENCY_TTL_HOURS)
    row = (
        db.query(GenerationIdempotencyKey)
        .filter(
            GenerationIdempotencyKey.user_id == user_id,
            GenerationIdempotencyKey.key == key,
            GenerationIdempotencyKey.created_at >= cutoff,
        )
        .first()
    )
    if not row:
        return None
    return db.query(GenerationJob).filter(GenerationJob.id == row.job_id).first()


def record_idempotency_key(
    db: Session,
    user_id: uuid.UUID,
    key: str,
    job_id: uuid.UUID,
) -> bool:
    """Return False if another request already recorded this key."""
    row = GenerationIdempotencyKey(user_id=user_id, key=key, job_id=job_id)
    db.add(row)
    try:
        db.flush()
        return True
    except IntegrityError:
        db.rollback()
        return False


def create_job_idempotent(
    db: Session,
    user: User,
    key: str | None,
    create_fn: Callable[[], GenerationJob],
) -> GenerationJob:
    """Return existing job for key or create a new one."""
    if not key:
        return create_fn()

    existing = find_idempotent_job(db, user.id, key)
    if existing:
        return existing

    job = create_fn()
    record_idempotency_key(db, user.id, key, job.id)
    if hasattr(job, "idempotency_key"):
        job.idempotency_key = key
    db.commit()
    db.refresh(job)
    return job
