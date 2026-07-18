"""User generation credits."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.config import settings
from app.models.schemas import CreditTransaction, UserCredit

GENERATION_COST = 1
PLAYLIST_COST = 3
REMIX_COST = 1
COVER_COST = 1
LYRICS_COST = 1


def get_or_create_credits(db: Session, user_id: uuid.UUID) -> UserCredit:
    row = db.query(UserCredit).filter(UserCredit.user_id == user_id).first()
    if not row:
        row = UserCredit(user_id=user_id, balance=0)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def record_credit_transaction(
    db: Session,
    user_id: uuid.UUID,
    credits: int,
    *,
    source: str,
    pack_id: str | None = None,
    external_id: str | None = None,
    commit: bool = True,
) -> CreditTransaction:
    tx = CreditTransaction(
        user_id=user_id,
        pack_id=pack_id,
        credits=credits,
        source=source,
        external_id=external_id,
    )
    db.add(tx)
    if commit:
        db.commit()
    else:
        db.flush()
    return tx


def grant_credits_with_transaction(
    db: Session,
    user_id: uuid.UUID,
    amount: int,
    *,
    source: str,
    external_id: str | None = None,
    pack_id: str | None = None,
    commit: bool = True,
) -> UserCredit:
    if amount <= 0:
        raise ValueError("amount must be positive")
    if external_id:
        existing = (
            db.query(CreditTransaction)
            .filter(CreditTransaction.external_id == external_id)
            .first()
        )
        if existing:
            return get_or_create_credits(db, user_id)
    row = get_or_create_credits(db, user_id)
    row.balance += amount
    record_credit_transaction(
        db,
        user_id,
        amount,
        source=source,
        pack_id=pack_id,
        external_id=external_id,
        commit=False,
    )
    if commit:
        db.commit()
        db.refresh(row)
    else:
        db.flush()
    return row


def grant_welcome_credits(db: Session, user_id: uuid.UUID) -> UserCredit | None:
    external_id = f"welcome_{user_id}"
    existing = (
        db.query(CreditTransaction)
        .filter(CreditTransaction.external_id == external_id)
        .first()
    )
    if existing:
        return get_or_create_credits(db, user_id)
    amount = settings.welcome_credits
    if amount <= 0:
        return get_or_create_credits(db, user_id)
    return grant_credits_with_transaction(
        db,
        user_id,
        amount,
        source="welcome",
        external_id=external_id,
        pack_id="welcome_pack",
    )


def deduct_credits(
    db: Session,
    user_id: uuid.UUID,
    cost: int,
    *,
    source: str = "generation",
    commit: bool = True,
) -> bool:
    """Atomically deduct credits. Returns False if balance is insufficient."""
    if cost <= 0:
        return True
    row = (
        db.query(UserCredit)
        .filter(UserCredit.user_id == user_id)
        .with_for_update()
        .first()
    )
    if not row:
        row = UserCredit(user_id=user_id, balance=0)
        db.add(row)
        db.flush()
    if row.balance < cost:
        db.rollback()
        return False
    row.balance -= cost
    record_credit_transaction(
        db,
        user_id,
        -cost,
        source=source,
        external_id=f"spend_{source}_{user_id}_{uuid.uuid4()}",
        commit=False,
    )
    if commit:
        db.commit()
        db.refresh(row)
    else:
        db.flush()
    return True


def check_and_deduct(db: Session, user_id: uuid.UUID, cost: int = GENERATION_COST, *, source: str = "generation") -> bool:
    return deduct_credits(db, user_id, cost, source=source)


def add_credits(db: Session, user_id: uuid.UUID, amount: int, *, source: str = "admin_grant") -> UserCredit:
    return grant_credits_with_transaction(db, user_id, amount, source=source)


def list_credit_transactions(db: Session, user_id: uuid.UUID, limit: int = 40):
    return (
        db.query(CreditTransaction)
        .filter(CreditTransaction.user_id == user_id)
        .order_by(CreditTransaction.created_at.desc())
        .limit(limit)
        .all()
    )


def credits_snapshot(
    db: Session,
    user_id: uuid.UUID,
    *,
    task_result: dict | None = None,
) -> dict:
    """Build API fields for post-mutation credit sync."""
    row = get_or_create_credits(db, user_id)
    out: dict = {"credits_balance": row.balance}
    if task_result is not None:
        out["task_reward"] = task_result
    return out
