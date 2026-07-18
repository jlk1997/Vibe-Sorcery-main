"""Pre-generation credits gate."""

from __future__ import annotations

import uuid

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.models.schemas import FeatureFlag, GenerationJob
from app.services.credits import GENERATION_COST, get_or_create_credits, grant_credits_with_transaction


def _credits_enabled(db: Session) -> bool:
    if not settings.credits_gate_enabled:
        return False
    flag = db.query(FeatureFlag).filter(FeatureFlag.key == "credits_gate").first()
    return flag is not None and flag.enabled


def charge_generation_credits(
    db: Session,
    user_id: uuid.UUID,
    cost: int = GENERATION_COST,
    *,
    source: str = "generation",
    defer_commit: bool = False,
) -> int:
    """Deduct credits when gate is on. Returns amount charged (0 if gate off)."""
    if not _credits_enabled(db):
        return 0
    from app.services.credits import deduct_credits

    if not deduct_credits(db, user_id, cost, source=source, commit=not defer_commit):
        raise HTTPException(status_code=402, detail="创作额度不足，请前往充值")
    if not defer_commit:
        from app.services.credit_alerts import check_balance_after_debit

        check_balance_after_debit(db, user_id)
    return cost


def require_generation_credits(db: Session, user_id: uuid.UUID, cost: int = GENERATION_COST) -> None:
    charge_generation_credits(db, user_id, cost=cost)


def with_credits_charged(config: dict, charged: int) -> dict:
    if not charged:
        return config
    merged = dict(config)
    merged["credits_charged"] = charged
    return merged


def refund_charged_credits(db: Session, user_id: uuid.UUID, cost: int, *, source: str = "refund") -> int:
    """Refund upfront credits (e.g. sync lyrics generation failure)."""
    if cost <= 0:
        return 0
    grant_credits_with_transaction(
        db,
        user_id,
        cost,
        source=source,
        external_id=f"refund_{user_id}_{uuid.uuid4()}",
    )
    return cost


def refund_job_credits_if_needed(db: Session, job: GenerationJob) -> int:
    """Refund upfront credits when a job fails or is cancelled (atomic under job row lock)."""
    from app.services.job_state import get_job_for_update

    locked = get_job_for_update(db, job.id)
    if not locked:
        return 0

    config = dict(locked.config or {})
    if config.get("credits_refunded"):
        return 0
    charged = int(config.get("credits_charged") or 0)
    if charged <= 0 or locked.status not in ("failed", "cancelled"):
        return 0

    grant_credits_with_transaction(
        db,
        locked.owner_id,
        charged,
        source="job_refund",
        external_id=f"job_refund_{locked.id}",
    )
    config["credits_refunded"] = True
    locked.config = config
    db.commit()
    return charged
