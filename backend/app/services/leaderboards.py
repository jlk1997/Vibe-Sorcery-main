"""Community leaderboards: heat, rising, remix, resonance."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.schemas import (
    Challenge,
    ChallengeEntry,
    LeaderboardSnapshot,
    ListenCheckin,
    Post,
    User,
    Work,
    WorkEngagementStats,
)
from app.services.cache import cache_get, cache_set

CHART_TYPES = ("heat", "rising", "remix", "resonance")
_CACHE_TTL = 120


def _period_key(period: str = "week") -> str:
    today = date.today()
    if period == "day":
        return today.isoformat()
    year, week, _ = today.isocalendar()
    return f"{year}-W{week:02d}"


def _heat_chart(db: Session, *, limit: int = 20) -> list[dict[str, Any]]:
    from app.api.routes.works import _resolve_audio_url

    since = datetime.utcnow() - timedelta(days=7)
    remix_counts = dict(
        db.query(Work.parent_work_id, func.count(Work.id))
        .filter(Work.parent_work_id.isnot(None))
        .group_by(Work.parent_work_id)
        .all()
    )
    rows = (
        db.query(Post, Work, User, WorkEngagementStats)
        .join(Work, Work.id == Post.work_id)
        .join(User, User.id == Post.author_id)
        .outerjoin(WorkEngagementStats, WorkEngagementStats.work_id == Work.id)
        .filter(Post.visibility == "public", Post.created_at >= since)
        .all()
    )
    ranked: list[tuple[float, Post, Work, User]] = []
    for post, work, author, stats in rows:
        listens = stats.listen_completes if stats else 0
        remixes = remix_counts.get(work.id, 0)
        score = listens * 0.4 + (post.like_count or 0) * 0.3 + (post.comment_count or 0) * 0.2 + remixes * 0.1
        ranked.append((score, post, work, author))
    ranked.sort(key=lambda x: x[0], reverse=True)
    return [
        {
            "rank": i + 1,
            "work_id": str(work.id),
            "post_id": str(post.id),
            "title": work.title,
            "author": author.username,
            "score": round(score, 2),
            "cover_url": work.cover_url,
            "audio_url": _resolve_audio_url(work),
            "hls_url": work.hls_url,
            "like_count": post.like_count or 0,
        }
        for i, (score, post, work, author) in enumerate(ranked[:limit])
    ]


def _rising_chart(db: Session, *, limit: int = 20) -> list[dict[str, Any]]:
    from app.api.routes.works import _resolve_audio_url

    since = datetime.utcnow() - timedelta(days=7)
    posts = (
        db.query(Post, Work, User)
        .join(Work, Work.id == Post.work_id)
        .join(User, User.id == Post.author_id)
        .filter(Post.visibility == "public", Post.created_at >= since)
        .order_by(Post.created_at.desc())
        .limit(100)
        .all()
    )
    ranked = []
    for post, work, author in posts:
        age_hours = max(1.0, (datetime.utcnow() - post.created_at).total_seconds() / 3600)
        score = ((post.like_count or 0) + 1) / age_hours
        ranked.append((score, post, work, author))
    ranked.sort(key=lambda x: x[0], reverse=True)
    return [
        {
            "rank": i + 1,
            "work_id": str(work.id),
            "post_id": str(post.id),
            "title": work.title,
            "author": author.username,
            "score": round(score, 2),
            "cover_url": work.cover_url,
            "audio_url": _resolve_audio_url(work),
            "hls_url": work.hls_url,
            "like_count": post.like_count or 0,
        }
        for i, (score, post, work, author) in enumerate(ranked[:limit])
    ]


def _remix_chart(db: Session, *, limit: int = 20) -> list[dict[str, Any]]:
    from app.api.routes.works import _resolve_audio_url

    since = datetime.utcnow() - timedelta(days=30)
    remix_counts = (
        db.query(Work.parent_work_id, func.count(Work.id).label("cnt"))
        .filter(Work.parent_work_id.isnot(None), Work.created_at >= since)
        .group_by(Work.parent_work_id)
        .order_by(func.count(Work.id).desc())
        .limit(limit * 2)
        .all()
    )
    ranked: list[tuple[int, Work, User, Post | None]] = []
    parent_ids = [pid for pid, _ in remix_counts]
    if not parent_ids:
        return []
    works = {w.id: w for w in db.query(Work).filter(Work.id.in_(parent_ids)).all()}
    owner_ids = {w.owner_id for w in works.values()}
    authors = {u.id: u for u in db.query(User).filter(User.id.in_(owner_ids)).all()}
    posts = {
        p.work_id: p
        for p in db.query(Post).filter(Post.work_id.in_(parent_ids), Post.visibility == "public").all()
    }
    for parent_id, cnt in remix_counts:
        work = works.get(parent_id)
        if not work:
            continue
        author = authors.get(work.owner_id)
        if not author:
            continue
        post = posts.get(work.id)
        downstream_likes = post.like_count if post else 0
        score = int(cnt) * 2 + downstream_likes
        ranked.append((score, work, author, post))
    ranked.sort(key=lambda x: x[0], reverse=True)
    return [
        {
            "rank": i + 1,
            "work_id": str(work.id),
            "post_id": str(post.id) if post else None,
            "title": work.title,
            "author": author.username,
            "remix_count": score // 2,
            "cover_url": work.cover_url,
            "audio_url": _resolve_audio_url(work),
            "hls_url": work.hls_url,
            "like_count": post.like_count if post else 0,
        }
        for i, (score, work, author, post) in enumerate(ranked[:limit])
    ]


def _resonance_chart(db: Session, *, limit: int = 20) -> list[dict[str, Any]]:
    from app.api.routes.works import _resolve_audio_url

    rows = (
        db.query(WorkEngagementStats, Work, User)
        .join(Work, Work.id == WorkEngagementStats.work_id)
        .join(User, User.id == Work.owner_id)
        .filter(WorkEngagementStats.resonance_count > 0)
        .order_by((WorkEngagementStats.resonance_total / WorkEngagementStats.resonance_count).desc())
        .limit(limit)
        .all()
    )
    work_ids = [work.id for _, work, _ in rows]
    posts = {
        p.work_id: p
        for p in db.query(Post).filter(Post.work_id.in_(work_ids), Post.visibility == "public").all()
    }
    out = []
    for i, (stats, work, author) in enumerate(rows):
        avg = stats.resonance_total / max(1, stats.resonance_count)
        post = posts.get(work.id)
        out.append(
            {
                "rank": i + 1,
                "work_id": str(work.id),
                "post_id": str(post.id) if post else None,
                "title": work.title,
                "author": author.username,
                "resonance_avg": round(avg, 3),
                "listen_completes": stats.listen_completes,
                "cover_url": work.cover_url,
                "audio_url": _resolve_audio_url(work),
                "hls_url": work.hls_url,
                "like_count": post.like_count if post else 0,
            }
        )
    return out


def get_chart(
    db: Session,
    chart_type: str,
    *,
    limit: int = 20,
    period: str = "week",
    persist_snapshot: bool = False,
) -> dict[str, Any]:
    if chart_type not in CHART_TYPES:
        chart_type = "heat"

    cache_key = f"chart:{chart_type}:{period}:{limit}"
    cached = cache_get(cache_key)
    if cached:
        return cached

    builders = {
        "heat": _heat_chart,
        "rising": _rising_chart,
        "remix": _remix_chart,
        "resonance": _resonance_chart,
    }
    entries = builders[chart_type](db, limit=limit)
    payload = {
        "chart_type": chart_type,
        "period": period,
        "period_key": _period_key(period),
        "entries": entries,
    }
    cache_set(cache_key, payload, ttl_seconds=_CACHE_TTL)

    if persist_snapshot:
        snap = LeaderboardSnapshot(
            chart_type=chart_type,
            period_key=_period_key(period),
            payload=entries,
        )
        db.add(snap)
        db.commit()

    return payload


def snapshot_all_charts(db: Session) -> int:
    count = 0
    for chart_type in CHART_TYPES:
        get_chart(db, chart_type, persist_snapshot=True)
        count += 1
    return count


def get_chart_history(
    db: Session,
    chart_type: str,
    *,
    period_key: str | None = None,
    limit: int = 20,
) -> dict[str, Any]:
    if chart_type not in CHART_TYPES:
        chart_type = "heat"
    query = db.query(LeaderboardSnapshot).filter(LeaderboardSnapshot.chart_type == chart_type)
    if period_key:
        query = query.filter(LeaderboardSnapshot.period_key == period_key)
    snap = query.order_by(LeaderboardSnapshot.created_at.desc()).first()
    if not snap:
        return {"chart_type": chart_type, "period_key": period_key, "entries": [], "snapshot_at": None}
    entries = (snap.payload or [])[:limit]
    return {
        "chart_type": chart_type,
        "period_key": snap.period_key,
        "entries": entries,
        "snapshot_at": snap.created_at.isoformat() if snap.created_at else None,
    }
