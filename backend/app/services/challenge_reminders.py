"""Remind challenge participants before challenges end."""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.models.schemas import Challenge, ChallengeEntry, Notification


def _already_reminded(db: Session, user_id, challenge_slug: str, since: datetime) -> bool:
    rows = (
        db.query(Notification.payload)
        .filter(
            Notification.user_id == user_id,
            Notification.type == "challenge_ending",
            Notification.created_at >= since,
        )
        .limit(20)
        .all()
    )
    return any((row[0] or {}).get("challenge_slug") == challenge_slug for row in rows)


def remind_ending_challenges(db: Session, *, hours_before: int = 24) -> int:
    now = datetime.utcnow()
    window_end = now + timedelta(hours=hours_before)
    challenges = (
        db.query(Challenge)
        .filter(
            Challenge.is_active == True,
            Challenge.ends_at.isnot(None),
            Challenge.ends_at > now,
            Challenge.ends_at <= window_end,
        )
        .all()
    )
    if not challenges:
        return 0

    from app.services.notifications import notify_challenge_ending

    sent = 0
    remind_since = now - timedelta(hours=hours_before + 1)
    for challenge in challenges:
        user_ids = [
            row[0]
            for row in db.query(ChallengeEntry.user_id)
            .filter(ChallengeEntry.challenge_id == challenge.id)
            .distinct()
            .all()
        ]
        hours_left = max(1, int((challenge.ends_at - now).total_seconds() / 3600))
        for uid in user_ids:
            if _already_reminded(db, uid, challenge.slug, remind_since):
                continue
            notify_challenge_ending(
                db,
                uid,
                challenge_slug=challenge.slug,
                challenge_title=challenge.title,
                hours_left=hours_left,
            )
            sent += 1
    if sent:
        db.commit()
    return sent
