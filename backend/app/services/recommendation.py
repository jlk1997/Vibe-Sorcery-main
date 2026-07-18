import math
import uuid
from typing import Optional

from sqlalchemy.orm import Session

from app.models.schemas import EmotionEmbedding, Follow, Post, User, UserPreference, Work


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def get_user_preference_vector(db: Session, user_id) -> tuple[list[str], list[str], Optional[list[float]]]:
    pref = db.query(UserPreference).filter(UserPreference.user_id == user_id).first()
    moods = pref.mood_tags if pref and pref.mood_tags else []
    genres = pref.genre_tags if pref and pref.genre_tags else []

    user_works = db.query(Work.id).filter(Work.owner_id == user_id).order_by(Work.created_at.desc()).limit(5).all()
    work_ids = [row[0] for row in user_works]
    if not work_ids:
        return moods, genres, None

    embs = (
        db.query(EmotionEmbedding)
        .filter(EmotionEmbedding.work_id.in_(work_ids))
        .all()
    )
    embeddings = []
    for emb in embs:
        if emb.embedding is not None:
            vec = list(emb.embedding) if not isinstance(emb.embedding, list) else emb.embedding
            embeddings.append(vec)

    avg_emb = None
    if embeddings:
        dim = len(embeddings[0])
        avg_emb = [sum(e[i] for e in embeddings) / len(embeddings) for i in range(dim)]
    return moods, genres, avg_emb


def _preload_personalization(
    db: Session,
    posts: list[Post],
    user: User,
) -> tuple[dict, dict, list[str], list[str], Optional[list[float]], set]:
    work_ids = list({p.work_id for p in posts})
    works = {w.id: w for w in db.query(Work).filter(Work.id.in_(work_ids)).all()}

    moods, genres, user_emb = get_user_preference_vector(db, user.id)

    following_rows = db.query(Follow.following_id).filter(Follow.follower_id == user.id).all()
    following_ids = {row[0] for row in following_rows}

    work_embs: dict = {}
    if user_emb and work_ids:
        rows = db.query(EmotionEmbedding).filter(EmotionEmbedding.work_id.in_(work_ids)).all()
        for row in rows:
            if row.embedding is not None:
                work_embs[row.work_id] = list(row.embedding) if not isinstance(row.embedding, list) else row.embedding

    return works, work_embs, moods, genres, user_emb, following_ids


def _score_with_context(
    post: Post,
    works: dict,
    work_embs: dict,
    moods: list[str],
    genres: list[str],
    user_emb: Optional[list[float]],
    following_ids: set,
) -> float:
    score = float(post.like_count) * 2 + float(post.comment_count)
    work = works.get(post.work_id)
    if not work:
        return score

    if moods and work.moods:
        score += len(set(moods) & set(work.moods)) * 5
    if genres and work.genres:
        score += len(set(genres) & set(work.genres)) * 3

    if user_emb:
        vec = work_embs.get(work.id)
        if vec:
            score += _cosine_similarity(user_emb, vec) * 20

    if post.author_id in following_ids:
        score += 15

    return score


def explain_post_recommendation(
    post: Post,
    work: Work,
    *,
    moods: list[str],
    genres: list[str],
    following_ids: set,
    work_embs: dict,
    user_emb: Optional[list[float]],
) -> str | None:
    """Return a machine-readable reason code for personalized feed chips."""
    if post.author_id in following_ids:
        return "following"
    if moods and work.moods:
        overlap = sorted(set(moods) & set(work.moods))
        if overlap:
            return f"mood:{overlap[0]}"
    if genres and work.genres:
        overlap = sorted(set(genres) & set(work.genres))
        if overlap:
            return f"genre:{overlap[0]}"
    if user_emb:
        vec = work_embs.get(work.id)
        if vec and _cosine_similarity(user_emb, vec) > 0.45:
            return "similar_taste"
    return None


def rank_posts(db: Session, posts: list[Post], user: User | None, sort: str = "personalized") -> list[Post]:
    ranked, _ctx = rank_posts_with_context(db, posts, user, sort=sort)
    return ranked


def rank_posts_with_context(
    db: Session,
    posts: list[Post],
    user: User | None,
    sort: str = "personalized",
) -> tuple[list[Post], dict | None]:
    """Rank posts and return personalization context for recommend_reason (single DB preload)."""
    if not posts:
        return [], None

    if sort == "latest":
        return sorted(posts, key=lambda p: p.created_at, reverse=True), None
    if sort == "popular":
        return sorted(posts, key=lambda p: p.like_count, reverse=True), None

    if sort == "following":
        if not user:
            return [], None
        _works, _embs, _moods, _genres, _emb, following_ids = _preload_personalization(db, posts, user)
        if not following_ids:
            return [], None
        filtered = [p for p in posts if p.author_id in following_ids]
        return sorted(filtered, key=lambda p: p.created_at, reverse=True), None

    if sort == "personalized" and user:
        works, work_embs, moods, genres, user_emb, following_ids = _preload_personalization(db, posts, user)
        author_ids = {p.author_id for p in posts}
        feed_following = following_ids & author_ids
        ranked = sorted(
            posts,
            key=lambda p: _score_with_context(p, works, work_embs, moods, genres, user_emb, following_ids),
            reverse=True,
        )
        ctx = {
            "moods": moods,
            "genres": genres,
            "user_emb": user_emb,
            "work_embs": work_embs,
            "following_ids": feed_following,
        }
        return ranked, ctx

    return sorted(posts, key=lambda p: p.created_at, reverse=True), None
