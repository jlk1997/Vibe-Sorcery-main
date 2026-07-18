from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_optional_user, require_admin
from app.api.routes.works import _resolve_audio_url
from app.database import get_db
from app.models.schemas import Challenge, ChallengeEntry, Post, User, Work
from app.services.challenge_awards import DEFAULT_CHALLENGE_DURATION_DAYS, challenge_entry_rank_score
from app.services.tenant import is_multi_tenant_enabled, scope_by_tenant, tenant_id_for_user
from app.services.work_access import parse_uuid

router = APIRouter(prefix="/challenges", tags=["challenges"])


class ChallengeCreate(BaseModel):
    slug: str = Field(min_length=3, max_length=100)
    title: str
    description: str | None = None
    hashtag: str
    target_curve: str = "calm_to_energy"
    prize_pool_credits: int = Field(default=0, ge=0, le=500)
    prize_winners: int = Field(default=3, ge=1, le=10)
    sponsor_label: str | None = None
    duration_days: int = Field(default=DEFAULT_CHALLENGE_DURATION_DAYS, ge=1, le=90)
    ends_at: str | None = None


class ChallengeEntryRequest(BaseModel):
    work_id: str
    caption: str | None = None


@router.get("")
def list_challenges(
    active_only: bool = True,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    query = db.query(Challenge)
    if active_only:
        query = query.filter(Challenge.is_active == True)
    query = scope_by_tenant(query, Challenge, user, db)
    challenges = query.order_by(Challenge.created_at.desc()).all()
    return [
        {
            "id": str(c.id),
            "slug": c.slug,
            "title": c.title,
            "description": c.description,
            "hashtag": c.hashtag,
            "target_curve": c.target_curve,
            "cover_url": c.cover_url,
            "ends_at": c.ends_at.isoformat() if c.ends_at else None,
            "participant_count": c.participant_count,
            "prize_pool_credits": getattr(c, "prize_pool_credits", 0) or 0,
            "sponsor_label": getattr(c, "sponsor_label", None),
            "awards_distributed": bool(getattr(c, "awards_distributed", False)),
            "is_active": c.is_active,
        }
        for c in challenges
    ]


@router.get("/{slug}")
def get_challenge(
    slug: str,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    query = db.query(Challenge).filter(Challenge.slug == slug)
    if is_multi_tenant_enabled(db):
        query = scope_by_tenant(query, Challenge, user, db)
    c = query.first()
    if not c:
        raise HTTPException(status_code=404, detail="Challenge not found")
    entries = (
        db.query(ChallengeEntry)
        .filter(ChallengeEntry.challenge_id == c.id)
        .order_by(ChallengeEntry.created_at.desc())
        .limit(50)
        .all()
    )
    work_ids = [e.work_id for e in entries]
    user_ids = [e.user_id for e in entries]

    works = {w.id: w for w in db.query(Work).filter(Work.id.in_(work_ids)).all()} if work_ids else {}
    users = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()} if user_ids else {}
    posts = (
        {
            p.work_id: p
            for p in db.query(Post).filter(Post.challenge_id == c.id, Post.work_id.in_(work_ids)).all()
        }
        if work_ids
        else {}
    )

    entry_list = []
    for e in entries:
        work = works.get(e.work_id)
        user = users.get(e.user_id)
        post = posts.get(e.work_id)
        like_score = post.like_count if post else 0
        rank_score = challenge_entry_rank_score(c, post)
        if work and user:
            entry_list.append({
                "work_id": str(work.id),
                "title": work.title,
                "author": user.username,
                "moods": work.moods or [],
                "audio_url": _resolve_audio_url(work),
                "cover_url": work.cover_url,
                "like_count": like_score,
                "rank_score": rank_score,
            })
    entry_list.sort(key=lambda x: x["rank_score"], reverse=True)
    return {
        "id": str(c.id),
        "slug": c.slug,
        "title": c.title,
        "description": c.description,
        "hashtag": c.hashtag,
        "target_curve": c.target_curve,
        "cover_url": c.cover_url,
        "ends_at": c.ends_at.isoformat() if c.ends_at else None,
        "participant_count": c.participant_count,
        "prize_pool_credits": getattr(c, "prize_pool_credits", 0) or 0,
        "sponsor_label": getattr(c, "sponsor_label", None),
        "awards_distributed": bool(getattr(c, "awards_distributed", False)),
        "entries": entry_list,
    }


@router.get("/{slug}/leaderboard")
def challenge_leaderboard(
    slug: str,
    limit: int = 20,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """Top challenge entries ranked by likes."""
    query = db.query(Challenge).filter(Challenge.slug == slug)
    if is_multi_tenant_enabled(db):
        query = scope_by_tenant(query, Challenge, user, db)
    c = query.first()
    if not c:
        raise HTTPException(status_code=404, detail="Challenge not found")
    entries = (
        db.query(ChallengeEntry)
        .filter(ChallengeEntry.challenge_id == c.id)
        .order_by(ChallengeEntry.created_at.desc())
        .limit(100)
        .all()
    )
    work_ids = [e.work_id for e in entries]
    user_ids = [e.user_id for e in entries]
    works = {w.id: w for w in db.query(Work).filter(Work.id.in_(work_ids)).all()} if work_ids else {}
    users = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()} if user_ids else {}
    posts = (
        {p.work_id: p for p in db.query(Post).filter(Post.challenge_id == c.id, Post.work_id.in_(work_ids)).all()}
        if work_ids
        else {}
    )
    ranked = []
    for e in entries:
        work = works.get(e.work_id)
        author = users.get(e.user_id)
        post = posts.get(e.work_id)
        if not work or not author:
            continue
        like_score = post.like_count if post else 0
        rank_score = challenge_entry_rank_score(c, post)
        ranked.append(
            {
                "rank": 0,
                "work_id": str(work.id),
                "title": work.title,
                "author": author.username,
                "like_count": like_score,
                "rank_score": rank_score,
                "cover_url": work.cover_url,
            }
        )
    ranked.sort(key=lambda x: x["rank_score"], reverse=True)
    for i, row in enumerate(ranked[:limit]):
        row["rank"] = i + 1
    return {"slug": slug, "title": c.title, "entries": ranked[:limit]}


@router.post("")
def create_challenge(
    payload: ChallengeCreate,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if db.query(Challenge).filter(Challenge.slug == payload.slug).first():
        raise HTTPException(status_code=400, detail="Slug already exists")
    now = datetime.utcnow()
    if payload.ends_at:
        try:
            ends_at = datetime.fromisoformat(payload.ends_at.replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid ends_at") from exc
    else:
        ends_at = now + timedelta(days=payload.duration_days)
    c = Challenge(
        slug=payload.slug,
        title=payload.title,
        description=payload.description,
        hashtag=payload.hashtag,
        target_curve=payload.target_curve,
        prize_pool_credits=payload.prize_pool_credits,
        prize_winners=payload.prize_winners,
        sponsor_label=payload.sponsor_label,
        starts_at=now,
        ends_at=ends_at,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return {"id": str(c.id), "slug": c.slug}


@router.post("/{slug}/enter")
def enter_challenge(
    slug: str,
    payload: ChallengeEntryRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    c = db.query(Challenge).filter(Challenge.slug == slug, Challenge.is_active == True).first()
    if not c:
        raise HTTPException(status_code=404, detail="Challenge not found")

    work = db.query(Work).filter(
        Work.id == parse_uuid(payload.work_id, field="work_id"),
        Work.owner_id == user.id,
    ).first()
    if not work:
        raise HTTPException(status_code=404, detail="Work not found")

    existing = db.query(ChallengeEntry).filter(
        ChallengeEntry.challenge_id == c.id,
        ChallengeEntry.work_id == work.id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Already entered")

    entry = ChallengeEntry(challenge_id=c.id, work_id=work.id, user_id=user.id)
    db.add(entry)
    c.participant_count += 1

    existing_post = db.query(Post).filter(Post.work_id == work.id).first()
    if existing_post:
        existing_post.challenge_id = c.id
        existing_post.visibility = "public"
        if payload.caption:
            existing_post.caption = payload.caption
        tags = list(existing_post.tags or [])
        if c.hashtag not in tags:
            tags.append(c.hashtag)
        existing_post.tags = tags
        post = existing_post
    else:
        post = Post(
            author_id=user.id,
            work_id=work.id,
            caption=payload.caption or f"#{c.hashtag}",
            tags=[c.hashtag],
            visibility="public",
            challenge_id=c.id,
            tenant_id=tenant_id_for_user(user),
        )
        db.add(post)

    work.visibility = "public"
    db.commit()
    db.refresh(entry)
    db.refresh(post)

    from app.services.user_engagement import complete_task

    task_result = complete_task(db, user.id, "first_challenge")

    from app.services.cache import invalidate_discovery_caches

    invalidate_discovery_caches()
    return {
        "entry_id": str(entry.id),
        "post_id": str(post.id),
        "task_reward": task_result,
    }
