"""Post-play engagement: listen checkins, mood radio, remix chain."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.models.schemas import EmotionJournalEntry, ListenCheckin, Post, User, Work, WorkEngagementStats
from app.services.credits import grant_credits_with_transaction

DAILY_CHECKIN_CREDIT_CAP = 3
CHECKIN_CREDIT_REWARD = 1
MIN_LISTEN_RATIO = 0.8


def _resonance_score(work: Work, arousal: float | None, valence: float | None) -> float:
    if arousal is None or valence is None:
        return 0.0
    if work.arousal is None or work.valence is None:
        return 0.5
    dist = ((float(work.arousal) - arousal) ** 2 + (float(work.valence) - valence) ** 2) ** 0.5
    return max(0.0, min(1.0, 1.0 - dist / 10.0))


def _today_checkin_credits(db: Session, user_id: uuid.UUID) -> int:
    today = date.today()
    rows = (
        db.query(ListenCheckin)
        .filter(
            ListenCheckin.user_id == user_id,
            ListenCheckin.entry_date == today,
            ListenCheckin.credits_granted == True,
        )
        .all()
    )
    return len(rows)


def submit_listen_checkin(
    db: Session,
    user_id: uuid.UUID,
    *,
    work_id: str,
    listen_ratio: float,
    arousal: float | None = None,
    valence: float | None = None,
    mood_tags: list[str] | None = None,
) -> dict[str, Any]:
    if listen_ratio < MIN_LISTEN_RATIO:
        raise HTTPException(status_code=400, detail="需要听完至少 80% 才能打卡")

    try:
        wid = uuid.UUID(work_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid work_id") from exc

    work = db.query(Work).filter(Work.id == wid).first()
    if not work:
        raise HTTPException(status_code=404, detail="Work not found")

    today = date.today()
    existing = (
        db.query(ListenCheckin)
        .filter(ListenCheckin.user_id == user_id, ListenCheckin.work_id == wid, ListenCheckin.entry_date == today)
        .first()
    )
    if existing:
        return {
            "duplicate": True,
            "resonance_score": existing.resonance_score,
            "credits_granted": 0,
        }

    resonance = _resonance_score(work, arousal, valence)
    credits_granted = False
    reward = 0
    if _today_checkin_credits(db, user_id) < DAILY_CHECKIN_CREDIT_CAP:
        grant_credits_with_transaction(
            db,
            user_id,
            CHECKIN_CREDIT_REWARD,
            source="listen_checkin",
            description="听完情绪打卡",
            defer_commit=True,
        )
        credits_granted = True
        reward = CHECKIN_CREDIT_REWARD

    row = ListenCheckin(
        user_id=user_id,
        work_id=wid,
        entry_date=today,
        listen_ratio=listen_ratio,
        arousal=arousal,
        valence=valence,
        mood_tags=mood_tags or [],
        resonance_score=resonance,
        credits_granted=credits_granted,
    )
    db.add(row)

    stats = db.query(WorkEngagementStats).filter(WorkEngagementStats.work_id == wid).first()
    if not stats:
        stats = WorkEngagementStats(work_id=wid)
        db.add(stats)
    stats.listen_completes = (stats.listen_completes or 0) + 1
    stats.resonance_total = (stats.resonance_total or 0.0) + resonance
    stats.resonance_count = (stats.resonance_count or 0) + 1
    stats.updated_at = datetime.utcnow()

    db.add(
        EmotionJournalEntry(
            user_id=user_id,
            entry_date=today,
            arousal=arousal,
            valence=valence,
            work_id=wid,
            mood_tags=mood_tags or [],
            note="listen_checkin",
        )
    )

    from app.services.user_engagement import on_engagement_event

    on_engagement_event(db, user_id, "listen_complete_checkin", {"work_id": work_id, "resonance": resonance})

    db.commit()
    return {
        "duplicate": False,
        "resonance_score": resonance,
        "credits_granted": reward,
    }


def mood_radio_daily(db: Session, user_id: uuid.UUID | None, *, limit: int = 3) -> list[dict[str, Any]]:
    """Pick community works for daily mood radio."""
    since = datetime.utcnow() - timedelta(days=14)
    query = (
        db.query(Post, Work, User)
        .join(Work, Work.id == Post.work_id)
        .join(User, User.id == Post.author_id)
        .filter(Post.visibility == "public", Post.created_at >= since)
        .order_by(Post.like_count.desc(), Post.created_at.desc())
        .limit(50)
    )
    rows = query.all()
    if not rows:
        return []

    preferred_moods: set[str] = set()
    if user_id:
        recent = (
            db.query(ListenCheckin)
            .filter(ListenCheckin.user_id == user_id)
            .order_by(ListenCheckin.created_at.desc())
            .limit(10)
            .all()
        )
        for r in recent:
            preferred_moods.update(r.mood_tags or [])

    scored: list[tuple[float, Post, Work, User]] = []
    for post, work, author in rows:
        score = float(post.like_count or 0) * 0.3
        moods = set(work.moods or [])
        if preferred_moods and moods & preferred_moods:
            score += 5.0
        stats = db.query(WorkEngagementStats).filter(WorkEngagementStats.work_id == work.id).first()
        if stats and stats.resonance_count:
            score += (stats.resonance_total / stats.resonance_count) * 2
        scored.append((score, post, work, author))

    scored.sort(key=lambda x: x[0], reverse=True)
    out: list[dict[str, Any]] = []
    for _, post, work, author in scored[:limit]:
        from app.api.routes.works import _resolve_audio_url

        out.append(
            {
                "work_id": str(work.id),
                "post_id": str(post.id),
                "title": work.title,
                "author": author.username,
                "cover_url": work.cover_url,
                "audio_url": _resolve_audio_url(work),
                "moods": work.moods or [],
                "arousal": work.arousal,
                "valence": work.valence,
            }
        )
    return out


def remix_chain_depth(db: Session, work_id: str) -> dict[str, Any]:
    try:
        root_id = uuid.UUID(work_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid work_id") from exc

    work = db.query(Work).filter(Work.id == root_id).first()
    if not work:
        raise HTTPException(status_code=404, detail="Work not found")

    depth = 0
    current = work
    while current.parent_work_id:
        depth += 1
        parent = db.query(Work).filter(Work.id == current.parent_work_id).first()
        if not parent:
            break
        current = parent

    children = db.query(Work).filter(Work.parent_work_id == root_id).count()
    descendants = (
        db.query(func.count(Work.id))
        .filter(Work.parent_work_id == root_id)
        .scalar()
        or 0
    )

    return {
        "work_id": work_id,
        "generation_depth": depth,
        "direct_remixes": int(descendants),
        "chain_label": f"接龙第 {depth + 1} 代" if depth > 0 else "原创",
        "root_work_id": str(current.id) if depth > 0 else work_id,
    }


def get_work_engagement_stats(db: Session, work_id: str) -> dict[str, Any]:
    try:
        wid = uuid.UUID(work_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid work_id") from exc

    stats = db.query(WorkEngagementStats).filter(WorkEngagementStats.work_id == wid).first()
    if not stats:
        return {
            "work_id": work_id,
            "listen_completes": 0,
            "resonance_avg": 0.0,
            "resonance_count": 0,
        }
    avg = stats.resonance_total / max(1, stats.resonance_count or 0)
    return {
        "work_id": work_id,
        "listen_completes": stats.listen_completes or 0,
        "resonance_avg": round(avg, 3),
        "resonance_count": stats.resonance_count or 0,
    }
