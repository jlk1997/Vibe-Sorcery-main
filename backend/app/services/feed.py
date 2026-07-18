"""Optimized feed assembly — batch DB loads, no N+1."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.api.routes.works import work_to_response
from app.api.schemas import PostResponse
from app.models.schemas import Collection, Follow, Like, Post, User, Work
from app.services.recommendation import explain_post_recommendation, rank_posts_with_context
from app.services.cache import cache_get, cache_set
from app.services.tenant import scope_by_tenant


def _post_response(
    post: Post,
    work: Work,
    author: User,
    *,
    liked_by_me: bool = False,
    author_is_following: bool = False,
    collected_by_me: bool = False,
    author_creator_level: str | None = None,
    parent_titles: dict | None = None,
    recommend_reason: str | None = None,
) -> PostResponse:
    parent_title = None
    if work.parent_work_id and parent_titles:
        parent_title = parent_titles.get(work.parent_work_id)
    return PostResponse(
        id=str(post.id),
        work_id=str(work.id),
        author_id=str(author.id),
        author_username=author.username,
        author_creator_level=author_creator_level,
        caption=post.caption,
        tags=post.tags or [],
        like_count=post.like_count,
        comment_count=post.comment_count,
        liked_by_me=liked_by_me,
        author_is_following=author_is_following,
        collected_by_me=collected_by_me,
        work=work_to_response(work, parent_title=parent_title),
        created_at=post.created_at.isoformat(),
        recommend_reason=recommend_reason,
    )


def build_feed(
    db: Session,
    *,
    user: User | None,
    sort: str = "personalized",
    tag: str | None = None,
    limit: int = 50,
) -> list[PostResponse]:
    uid = str(user.id) if user else "anon"
    cache_key = f"feed:v4:{uid}:{sort}:{tag or ''}:{limit}"
    cached = cache_get(cache_key)
    if cached is not None:
        return [PostResponse(**row) for row in cached]

    query = scope_by_tenant(db.query(Post).filter(Post.visibility == "public"), Post, user, db)
    if tag:
        query = query.filter(Post.tags.contains([tag]))

    posts = query.order_by(Post.created_at.desc()).limit(min(limit * 2, 100)).all()
    if not posts:
        return []

    posts, personalize_ctx = rank_posts_with_context(db, posts, user, sort=sort)
    posts = posts[:limit]

    work_ids = list({p.work_id for p in posts})
    author_ids = list({p.author_id for p in posts})

    works = {w.id: w for w in db.query(Work).filter(Work.id.in_(work_ids)).all()}
    authors = {u.id: u for u in db.query(User).filter(User.id.in_(author_ids)).all()}

    liked_ids: set = set()
    following_ids: set = set()
    collected_work_ids: set = set()
    if user and posts:
        post_ids = [p.id for p in posts]
        liked_ids = {
            row[0]
            for row in db.query(Like.post_id).filter(Like.user_id == user.id, Like.post_id.in_(post_ids)).all()
        }
        following_ids = {
            row[0]
            for row in db.query(Follow.following_id).filter(
                Follow.follower_id == user.id, Follow.following_id.in_(author_ids)
            ).all()
        }
        collected_work_ids = {
            row[0]
            for row in db.query(Collection.work_id).filter(
                Collection.user_id == user.id, Collection.work_id.in_(work_ids)
            ).all()
        }

    from app.services.user_engagement import batch_creator_levels

    creator_levels = batch_creator_levels(db, author_ids)

    parent_ids = list({w.parent_work_id for w in works.values() if w.parent_work_id})
    parent_titles = {}
    if parent_ids:
        parent_titles = {row.id: row.title for row in db.query(Work).filter(Work.id.in_(parent_ids)).all()}

    results: list[PostResponse] = []
    for post in posts:
        work = works.get(post.work_id)
        author = authors.get(post.author_id)
        if work and author:
            reason = None
            if personalize_ctx:
                reason = explain_post_recommendation(
                    post,
                    work,
                    moods=personalize_ctx["moods"],
                    genres=personalize_ctx["genres"],
                    following_ids=personalize_ctx["following_ids"],
                    work_embs=personalize_ctx["work_embs"],
                    user_emb=personalize_ctx["user_emb"],
                )
            results.append(
                _post_response(
                    post,
                    work,
                    author,
                    liked_by_me=post.id in liked_ids,
                    author_is_following=post.author_id in following_ids,
                    collected_by_me=work.id in collected_work_ids,
                    author_creator_level=creator_levels.get(post.author_id),
                    parent_titles=parent_titles,
                    recommend_reason=reason,
                )
            )

    if results:
        cache_set(cache_key, [r.model_dump() for r in results], 25)
    return results


def build_user_posts(
    db: Session,
    *,
    author: User,
    viewer: User | None,
    limit: int = 50,
) -> list[PostResponse]:
    posts = (
        db.query(Post)
        .filter(Post.author_id == author.id, Post.visibility == "public")
        .order_by(Post.created_at.desc())
        .limit(min(max(limit, 1), 50))
        .all()
    )
    if not posts:
        return []

    work_ids = list({p.work_id for p in posts})
    works = {w.id: w for w in db.query(Work).filter(Work.id.in_(work_ids)).all()}

    liked_ids: set = set()
    if viewer and posts:
        post_ids = [p.id for p in posts]
        liked_ids = {
            row[0]
            for row in db.query(Like.post_id).filter(Like.user_id == viewer.id, Like.post_id.in_(post_ids)).all()
        }

    results: list[PostResponse] = []
    for post in posts:
        work = works.get(post.work_id)
        if work:
            results.append(_post_response(post, work, author, liked_by_me=post.id in liked_ids))
    return results
