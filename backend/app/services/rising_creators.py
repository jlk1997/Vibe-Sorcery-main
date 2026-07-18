"""Weekly rising creators for discover feed."""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.schemas import Post, User
from app.services.cache import cache_get, cache_set
from app.services.user_engagement import batch_creator_levels

RISING_CACHE_TTL = 300.0


def rising_creators(db: Session, *, days: int = 7, limit: int = 5) -> list[dict]:
    cache_key = f"rising_creators:{days}:{limit}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    since = datetime.utcnow() - timedelta(days=days)
    rows = (
        db.query(Post.author_id, func.count(Post.id).label("posts"))
        .filter(Post.visibility == "public", Post.created_at >= since)
        .group_by(Post.author_id)
        .order_by(func.count(Post.id).desc())
        .limit(min(max(limit, 1), 10))
        .all()
    )
    if not rows:
        cache_set(cache_key, [], RISING_CACHE_TTL)
        return []

    author_ids = [row[0] for row in rows]
    authors = {u.id: u for u in db.query(User).filter(User.id.in_(author_ids)).all()}
    levels = batch_creator_levels(db, author_ids)

    result: list[dict] = []
    for author_id, posts in rows:
        author = authors.get(author_id)
        if not author:
            continue
        result.append(
            {
                "username": author.username,
                "display_name": author.display_name or author.username,
                "avatar_url": author.avatar_url,
                "posts_count": int(posts),
                "creator_level": levels.get(author_id, "novice"),
            }
        )
    cache_set(cache_key, result, RISING_CACHE_TTL)
    return result
