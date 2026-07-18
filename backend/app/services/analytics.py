"""Client analytics events."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.models.schemas import AnalyticsEvent


def track_event(
    db: Session,
    event: str,
    *,
    user_id: uuid.UUID | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    row = AnalyticsEvent(
        user_id=user_id,
        event=event[:64],
        payload=payload or {},
    )
    db.add(row)
    db.commit()
    if user_id:
        try:
            from app.services.user_engagement import on_engagement_event

            on_engagement_event(db, user_id, event, payload or {})
        except Exception:
            pass


def conversion_stats(db: Session, *, days: int = 30) -> dict[str, int]:
    from datetime import datetime, timedelta

    since = datetime.utcnow() - timedelta(days=days)
    rows = db.query(AnalyticsEvent).filter(AnalyticsEvent.created_at >= since).all()
    counts: dict[str, int] = {}
    for r in rows:
        counts[r.event] = counts.get(r.event, 0) + 1
    return counts


def activation_funnel(db: Session, *, days: int = 30) -> dict[str, int]:
    """New-user activation funnel from analytics events."""
    from datetime import datetime, timedelta

    since = datetime.utcnow() - timedelta(days=days)
    rows = (
        db.query(AnalyticsEvent)
        .filter(AnalyticsEvent.created_at >= since)
        .all()
    )
    events: dict[str, set] = {
        "activation_preset_selected": set(),
        "activation_first_generate_start": set(),
        "activation_first_generate_complete": set(),
        "activation_first_listen": set(),
        "activation_first_publish": set(),
    }
    for r in rows:
        if r.event in events and r.user_id:
            events[r.event].add(r.user_id)

    from app.models.schemas import User

    new_users = (
        db.query(User)
        .filter(User.created_at >= since)
        .count()
    )
    return {
        "period_days": days,
        "new_registrations": new_users,
        "preset_selected": len(events["activation_preset_selected"]),
        "first_generate_start": len(events["activation_first_generate_start"]),
        "first_generate_complete": len(events["activation_first_generate_complete"]),
        "first_listen": len(events["activation_first_listen"]),
        "first_publish": len(events["activation_first_publish"]),
    }


def conversion_funnel(db: Session, *, days: int = 30) -> dict[str, int]:
    """Register → generate → publish → pay funnel from analytics + DB."""
    stats = conversion_stats(db, days=days)
    from app.models.schemas import User

    users = db.query(User).count()
    return {
        "registered": users,
        "first_generate": stats.get("studio_generate_start", 0) + stats.get("first_generate", 0),
        "work_published": stats.get("work_published", 0),
        "mood_feedback_submitted": stats.get("mood_feedback_submitted", 0),
        "402_insufficient": stats.get("402_insufficient", 0),
        "paywall_view": stats.get("paywall_view", 0),
        "paywall_purchase_start": stats.get("paywall_purchase_start", 0),
        "paywall_dismiss": stats.get("paywall_dismiss", 0),
        "payment_start": stats.get("payment_start", 0),
        "payment_success": stats.get("payment_success", 0),
        "subscription_purchase": stats.get("subscription_purchase", 0),
    }
