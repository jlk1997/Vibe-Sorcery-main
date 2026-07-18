"""Challenge auto-award when period ends."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from app.models.schemas import Challenge, ChallengeEntry, Post, User, Work
from app.services.credits import grant_credits_with_transaction

DEFAULT_CHALLENGE_DURATION_DAYS = 14


def challenge_entry_rank_score(challenge: Challenge, post: Post | None) -> int:
    """Time-decayed like score — shared by leaderboard API and prize distribution."""
    likes = post.like_count if post else 0
    if post and post.created_at and challenge.ends_at:
        hours = max(1.0, (challenge.ends_at - post.created_at).total_seconds() / 3600)
        return int(likes * (1.0 + 24.0 / hours))
    return likes


def distribute_challenge_prizes(db: Session, challenge: Challenge) -> dict:
    if challenge.awards_distributed:
        return {"skipped": True, "reason": "already_distributed"}
    if challenge.ends_at and challenge.ends_at > datetime.utcnow():
        return {"skipped": True, "reason": "not_ended"}
    if not challenge.prize_pool_credits or challenge.prize_pool_credits <= 0:
        challenge.awards_distributed = True
        db.commit()
        return {"skipped": True, "reason": "no_prize_pool"}

    entries = db.query(ChallengeEntry).filter(ChallengeEntry.challenge_id == challenge.id).all()
    if not entries:
        challenge.awards_distributed = True
        db.commit()
        return {"awarded": 0}

    work_ids = [e.work_id for e in entries]
    posts = {p.work_id: p for p in db.query(Post).filter(Post.challenge_id == challenge.id, Post.work_id.in_(work_ids)).all()}
    ranked: list[tuple[int, ChallengeEntry, Post | None]] = []
    for entry in entries:
        post = posts.get(entry.work_id)
        score = challenge_entry_rank_score(challenge, post)
        ranked.append((score, entry, post))
    ranked.sort(key=lambda x: x[0], reverse=True)

    winners = min(challenge.prize_winners or 3, len(ranked))
    pool = challenge.prize_pool_credits
    weights = [0.5, 0.3, 0.2] + [0.0] * max(0, winners - 3)
    awarded = 0
    for i in range(winners):
        _, entry, _ = ranked[i]
        share = weights[i] if i < len(weights) else 0.1 / max(1, winners - 3)
        amount = max(1, int(pool * share))
        grant_credits_with_transaction(
            db,
            entry.user_id,
            amount,
            source="challenge_prize",
            commit=False,
        )
        awarded += 1
        from app.services.notifications import notify_challenge_award

        user = db.query(User).filter(User.id == entry.user_id).first()
        work = db.query(Work).filter(Work.id == entry.work_id).first()
        if user and work:
            notify_challenge_award(
                db,
                entry.user_id,
                challenge_title=challenge.title,
                rank=i + 1,
                credits=amount,
                work_title=work.title,
            )

    challenge.awards_distributed = True
    challenge.is_active = False
    db.commit()
    return {"awarded": awarded, "challenge_slug": challenge.slug}


def finalize_ended_challenges(db: Session) -> int:
    now = datetime.utcnow()
    rows = (
        db.query(Challenge)
        .filter(
            Challenge.is_active == True,
            Challenge.awards_distributed == False,
            Challenge.ends_at.isnot(None),
            Challenge.ends_at <= now,
        )
        .all()
    )
    count = 0
    for c in rows:
        distribute_challenge_prizes(db, c)
        count += 1
    return count
