"""Per-user concurrent generation job limits."""

from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.schemas import GenerationJob, User
from app.services.job_state import ACTIVE_JOB_STATUSES
from app.services.subscriptions import is_active_subscriber


def max_active_jobs(db: Session, user_id: uuid.UUID) -> int:
    return 2 if is_active_subscriber(db, user_id) else 1


def enforce_active_job_limit(db: Session, user: User) -> None:
    """Lock active jobs for user; raise 409 when at capacity."""
    limit = max_active_jobs(db, user.id)
    active_rows = (
        db.query(GenerationJob.id)
        .filter(
            GenerationJob.owner_id == user.id,
            GenerationJob.status.in_(ACTIVE_JOB_STATUSES),
        )
        .with_for_update()
        .all()
    )
    if len(active_rows) >= limit:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "ACTIVE_JOB_LIMIT",
                "message": f"最多同时进行 {limit} 个生成任务，请等待当前任务完成或取消后再试",
                "limit": limit,
                "active_count": len(active_rows),
            },
        )
