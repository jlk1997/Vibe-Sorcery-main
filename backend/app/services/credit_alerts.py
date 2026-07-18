"""Low-credit alerts and balance monitoring."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.config import settings
from app.models.schemas import Notification, UserCredit
from app.services.notifications import create_notification

LOW_CREDIT_THRESHOLD = 5


def maybe_notify_low_credits(db: Session, user_id: uuid.UUID, balance: int) -> bool:
    """Send in-app alert when balance drops below threshold (once per day)."""
    if balance >= LOW_CREDIT_THRESHOLD:
        return False

    from datetime import datetime

    dedupe_key = datetime.utcnow().strftime("%Y-%m-%d")
    existing = (
        db.query(Notification)
        .filter(
            Notification.user_id == user_id,
            Notification.type == "low_credits",
        )
        .all()
    )
    if any((n.payload or {}).get("dedupe_key") == dedupe_key for n in existing):
        return False

    create_notification(
        db,
        user_id,
        "low_credits",
        {
            "balance": balance,
            "threshold": LOW_CREDIT_THRESHOLD,
            "dedupe_key": dedupe_key,
            "message": f"额度仅剩 {balance}，建议充值或开通会员",
        },
    )
    try:
        from app.services.wechat_subscribe import try_notify_low_credits

        try_notify_low_credits(db, user_id, balance)
    except Exception:
        pass
    return True


def check_balance_after_debit(db: Session, user_id: uuid.UUID) -> int | None:
    row = db.query(UserCredit).filter(UserCredit.user_id == user_id).first()
    if not row:
        return None
    maybe_notify_low_credits(db, user_id, row.balance)
    return row.balance
