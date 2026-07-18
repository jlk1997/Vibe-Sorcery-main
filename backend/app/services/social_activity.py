"""Aggregate social activity events for the discovery activity stream."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.models.schemas import Challenge, ChallengeEntry, Comment, CreatorTip, Duel, Follow, Like, Post, User, Work
from app.services.cache import cache_get, cache_set

_ACTIVITY_CACHE_TTL = 45
_PER_SOURCE_LIMIT = 12


def get_activity_stream(
    db: Session,
    user_id: uuid.UUID | None,
    *,
    scope: str = "global",
    limit: int = 30,
) -> list[dict[str, Any]]:
    scope = scope if scope in ("global", "following") else "global"
    limit = min(max(limit, 1), 50)
    cache_key = f"activity:{scope}:{user_id or 'anon'}:{limit}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    since = datetime.utcnow() - timedelta(days=14)
    following_ids: set[uuid.UUID] = set()
    if scope == "following":
        if not user_id:
            return []
        following_ids = {
            row[0]
            for row in db.query(Follow.following_id).filter(Follow.follower_id == user_id).all()
        }
        if not following_ids:
            cache_set(cache_key, [], ttl_seconds=_ACTIVITY_CACHE_TTL)
            return []

    per_source = min(_PER_SOURCE_LIMIT, limit)
    events: list[dict[str, Any]] = []

    tip_rows = (
        db.query(CreatorTip, Work, User)
        .join(Work, Work.id == CreatorTip.work_id)
        .join(User, User.id == CreatorTip.from_user_id)
        .filter(CreatorTip.is_public == True, CreatorTip.created_at >= since)
        .order_by(CreatorTip.created_at.desc())
        .limit(per_source)
        .all()
    )
    for tip, work, tipper in tip_rows:
        if scope == "following" and work.owner_id not in following_ids and tip.from_user_id not in following_ids:
            continue
        events.append(
            {
                "type": "public_tip",
                "at": tip.created_at.isoformat() if tip.created_at else None,
                "actor": tipper.username,
                "work_id": str(work.id),
                "work_title": work.title,
                "credits": tip.credits,
                "message": tip.public_message,
            }
        )

    duel_rows = (
        db.query(Duel, User, Work)
        .join(User, User.id == Duel.challenger_id)
        .join(Work, Work.id == Duel.challenger_work_id)
        .filter(Duel.created_at >= since)
        .order_by(Duel.created_at.desc())
        .limit(per_source)
        .all()
    )
    for duel, challenger, challenger_work in duel_rows:
        if scope == "following" and duel.challenger_id not in following_ids:
            if not duel.opponent_id or duel.opponent_id not in following_ids:
                continue
        events.append(
            {
                "type": "duel_started",
                "at": duel.created_at.isoformat() if duel.created_at else None,
                "actor": challenger.username,
                "duel_id": str(duel.id),
                "status": duel.status,
                "work_title": challenger_work.title if challenger_work else None,
            }
        )

    entry_rows = (
        db.query(ChallengeEntry, Challenge, User, Work)
        .join(Challenge, Challenge.id == ChallengeEntry.challenge_id)
        .join(User, User.id == ChallengeEntry.user_id)
        .join(Work, Work.id == ChallengeEntry.work_id)
        .filter(ChallengeEntry.created_at >= since)
        .order_by(ChallengeEntry.created_at.desc())
        .limit(per_source)
        .all()
    )
    for entry, challenge, author, work in entry_rows:
        if scope == "following" and entry.user_id not in following_ids:
            continue
        events.append(
            {
                "type": "challenge_entry",
                "at": entry.created_at.isoformat() if entry.created_at else None,
                "actor": author.username,
                "challenge_slug": challenge.slug,
                "challenge_title": challenge.title,
                "work_id": str(work.id),
                "work_title": work.title,
            }
        )

    remix_rows = (
        db.query(Work, User)
        .join(User, User.id == Work.owner_id)
        .filter(Work.parent_work_id.isnot(None), Work.created_at >= since)
        .order_by(Work.created_at.desc())
        .limit(per_source)
        .all()
    )
    parent_ids = {w.parent_work_id for w, _ in remix_rows if w.parent_work_id}
    parent_titles: dict[uuid.UUID, str] = {}
    if parent_ids:
        parent_titles = {
            pid: title
            for pid, title in db.query(Work.id, Work.title).filter(Work.id.in_(parent_ids)).all()
        }
    for work, author in remix_rows:
        if scope == "following" and work.owner_id not in following_ids:
            continue
        parent_title = parent_titles.get(work.parent_work_id) if work.parent_work_id else None
        events.append(
            {
                "type": "work_remixed",
                "at": work.created_at.isoformat() if work.created_at else None,
                "actor": author.username,
                "work_id": str(work.id),
                "work_title": work.title,
                "parent_work_id": str(work.parent_work_id) if work.parent_work_id else None,
                "parent_title": parent_title,
            }
        )

    post_rows = (
        db.query(Post, User, Work)
        .join(User, User.id == Post.author_id)
        .join(Work, Work.id == Post.work_id)
        .filter(Post.visibility == "public", Post.created_at >= since)
        .order_by(Post.created_at.desc())
        .limit(per_source)
        .all()
    )
    for post, author, work in post_rows:
        if scope == "following" and post.author_id not in following_ids:
            continue
        events.append(
            {
                "type": "work_published",
                "at": post.created_at.isoformat() if post.created_at else None,
                "actor": author.username,
                "post_id": str(post.id),
                "work_id": str(work.id),
                "work_title": work.title,
            }
        )

    like_rows = (
        db.query(Like, User, Post, Work)
        .join(User, User.id == Like.user_id)
        .join(Post, Post.id == Like.post_id)
        .join(Work, Work.id == Post.work_id)
        .filter(Like.created_at >= since, Post.visibility == "public")
        .order_by(Like.created_at.desc())
        .limit(per_source)
        .all()
    )
    for like, actor, post, work in like_rows:
        if scope == "following" and like.user_id not in following_ids:
            continue
        events.append(
            {
                "type": "post_liked",
                "at": like.created_at.isoformat() if like.created_at else None,
                "actor": actor.username,
                "post_id": str(post.id),
                "work_id": str(work.id),
                "work_title": work.title,
            }
        )

    comment_rows = (
        db.query(Comment, User, Post, Work)
        .join(User, User.id == Comment.user_id)
        .join(Post, Post.id == Comment.post_id)
        .join(Work, Work.id == Post.work_id)
        .filter(Comment.created_at >= since, Comment.is_filtered == False, Post.visibility == "public")
        .order_by(Comment.created_at.desc())
        .limit(per_source)
        .all()
    )
    for comment, actor, post, work in comment_rows:
        if scope == "following" and comment.user_id not in following_ids:
            continue
        events.append(
            {
                "type": "comment_added",
                "at": comment.created_at.isoformat() if comment.created_at else None,
                "actor": actor.username,
                "post_id": str(post.id),
                "work_id": str(work.id),
                "work_title": work.title,
                "preview": (comment.content or "")[:80],
            }
        )

    follow_rows = (
        db.query(Follow, User)
        .join(User, User.id == Follow.follower_id)
        .filter(Follow.created_at >= since)
        .order_by(Follow.created_at.desc())
        .limit(per_source)
        .all()
    )
    following_usernames: dict[uuid.UUID, str] = {}
    if follow_rows:
        target_ids = {f.following_id for f, _ in follow_rows}
        following_usernames = {
            uid: uname
            for uid, uname in db.query(User.id, User.username).filter(User.id.in_(target_ids)).all()
        }
    for follow, follower in follow_rows:
        target_name = following_usernames.get(follow.following_id)
        if not target_name:
            continue
        if scope == "following" and follow.follower_id not in following_ids:
            continue
        events.append(
            {
                "type": "user_followed",
                "at": follow.created_at.isoformat() if follow.created_at else None,
                "actor": follower.username,
                "target_user": target_name,
            }
        )

    events.sort(key=lambda e: e.get("at") or "", reverse=True)
    result = events[:limit]
    cache_set(cache_key, result, ttl_seconds=_ACTIVITY_CACHE_TTL)
    return result
