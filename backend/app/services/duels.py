"""Emotion Duel — async PK between two works."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.schemas import Duel, DuelVote, Post, User, UserDuelQuota, Work
from app.services.generation_gate import charge_generation_credits
from app.services.credits import grant_credits_with_transaction
from app.services.listen_engagement import _resonance_score
from app.services.subscriptions import is_active_subscriber

DUEL_START_COST = 1
DUEL_VOTE_HOURS = 24
WINNER_CREDITS = 2
LOSER_CREDITS = 0.5
MEMBER_FREE_STARTS_PER_DAY = 1

EMOTION_TAG_MOODS: dict[str, tuple[float, float]] = {
    "calm": (3.0, 6.0),
    "joy": (6.0, 8.0),
    "melancholy": (3.0, 3.0),
    "energy": (8.0, 7.0),
}


def _emotion_resonance(db: Session, work_id: uuid.UUID, emotion_tag: str | None) -> float:
    if not emotion_tag:
        return 0.5
    work = db.query(Work).filter(Work.id == work_id).first()
    if not work:
        return 0.5
    coords = EMOTION_TAG_MOODS.get(emotion_tag.lower())
    if not coords:
        return 0.5
    return _resonance_score(work, coords[0], coords[1])


def _refresh_duel_resonance(db: Session, duel: Duel) -> None:
    """Aggregate resonance from duel votes and listen checkins since duel start."""
    from app.models.schemas import ListenCheckin

    since = duel.created_at or datetime.utcnow()

    def avg_vote_resonance(side: str, work_id: uuid.UUID | None) -> float | None:
        if not work_id:
            return None
        votes = db.query(DuelVote).filter(DuelVote.duel_id == duel.id, DuelVote.side == side).all()
        if not votes:
            return None
        scores = [_emotion_resonance(db, work_id, v.emotion_tag) for v in votes]
        return sum(scores) / len(scores)

    def avg_checkin_resonance(work_id: uuid.UUID | None) -> float | None:
        if not work_id:
            return None
        rows = (
            db.query(ListenCheckin)
            .filter(
                ListenCheckin.work_id == work_id,
                ListenCheckin.created_at >= since,
                ListenCheckin.resonance_score > 0,
            )
            .all()
        )
        if not rows:
            return None
        return sum(r.resonance_score for r in rows) / len(rows)

    parts_a = [
        x
        for x in [
            avg_vote_resonance("a", duel.challenger_work_id),
            avg_checkin_resonance(duel.challenger_work_id),
        ]
        if x is not None
    ]
    parts_b = [
        x
        for x in [
            avg_vote_resonance("b", duel.opponent_work_id),
            avg_checkin_resonance(duel.opponent_work_id),
        ]
        if x is not None
    ]
    if parts_a:
        duel.challenger_resonance = sum(parts_a) / len(parts_a)
    if parts_b:
        duel.opponent_resonance = sum(parts_b) / len(parts_b)


def _work_payload(work: Work | None) -> dict[str, Any] | None:
    if not work:
        return None
    from app.api.routes.works import _resolve_audio_url

    return {
        "id": str(work.id),
        "title": work.title,
        "cover_url": work.cover_url,
        "audio_url": _resolve_audio_url(work),
        "hls_url": work.hls_url,
    }


def get_duel_quota(db: Session, user: User) -> dict[str, Any]:
    quota = _get_or_create_quota(db, user.id)
    is_member = is_active_subscriber(db, user.id)
    free_left = max(0, MEMBER_FREE_STARTS_PER_DAY - (quota.free_starts_used or 0)) if is_member else 0
    return {
        "member_free_remaining": free_left if is_member else 0,
        "pass_starts_remaining": quota.pass_starts_remaining or 0,
        "start_cost": DUEL_START_COST,
        "is_member": is_member,
    }


def _get_or_create_quota(db: Session, user_id: uuid.UUID) -> UserDuelQuota:
    today = date.today()
    row = (
        db.query(UserDuelQuota)
        .filter(UserDuelQuota.user_id == user_id, UserDuelQuota.quota_date == today)
        .first()
    )
    if not row:
        row = UserDuelQuota(user_id=user_id, quota_date=today)
        db.add(row)
        db.flush()
    return row


def _charge_duel_start(db: Session, user: User) -> dict[str, Any]:
    quota = _get_or_create_quota(db, user.id)
    if quota.pass_starts_remaining > 0:
        quota.pass_starts_remaining -= 1
        return {"charged": False, "source": "duel_pass"}

    is_member = is_active_subscriber(db, user.id)
    if is_member and (quota.free_starts_used or 0) < MEMBER_FREE_STARTS_PER_DAY:
        quota.free_starts_used = (quota.free_starts_used or 0) + 1
        return {"charged": False, "source": "member_free"}

    charge_generation_credits(
        db,
        user.id,
        cost=DUEL_START_COST,
        source="duel_start",
        defer_commit=True,
    )
    return {"charged": True, "source": "credits", "cost": DUEL_START_COST}


def create_duel(
    db: Session,
    user: User,
    *,
    work_id: str,
    opponent_username: str | None = None,
    theme: str = "emotion",
) -> dict[str, Any]:
    try:
        wid = uuid.UUID(work_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid work_id") from exc

    work = db.query(Work).filter(Work.id == wid, Work.owner_id == user.id).first()
    if not work:
        raise HTTPException(status_code=404, detail="Work not found")

    post = db.query(Post).filter(Post.work_id == wid, Post.visibility == "public").first()
    if not post:
        raise HTTPException(status_code=400, detail="作品需先发布到社区才能发起决斗")

    charge_info = _charge_duel_start(db, user)

    opponent_id = None
    if opponent_username:
        opponent = db.query(User).filter(User.username == opponent_username).first()
        if not opponent:
            raise HTTPException(status_code=404, detail="对手用户不存在")
        if opponent.id == user.id:
            raise HTTPException(status_code=400, detail="不能挑战自己")
        opponent_id = opponent.id

    duel = Duel(
        challenger_id=user.id,
        challenger_work_id=wid,
        opponent_id=opponent_id,
        theme=theme[:64],
        status="pending" if opponent_id else "open",
    )
    db.add(duel)
    db.commit()
    db.refresh(duel)

    if opponent_id:
        from app.services.notifications import notify_duel_invite

        notify_duel_invite(db, opponent_id, challenger_username=user.username, duel_id=str(duel.id))

    from app.services.cache import invalidate_discovery_caches

    invalidate_discovery_caches()
    return {
        "duel_id": str(duel.id),
        "status": duel.status,
        "charge": charge_info,
    }


def accept_duel(
    db: Session,
    user: User,
    duel_id: str,
    *,
    work_id: str,
) -> dict[str, Any]:
    try:
        did = uuid.UUID(duel_id)
        wid = uuid.UUID(work_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid id") from exc

    duel = db.query(Duel).filter(Duel.id == did).first()
    if not duel:
        raise HTTPException(status_code=404, detail="Duel not found")
    if duel.status not in ("pending", "open"):
        raise HTTPException(status_code=400, detail="决斗已不可应战")
    if duel.opponent_id and duel.opponent_id != user.id:
        raise HTTPException(status_code=403, detail="该决斗已指定其他对手")

    work = db.query(Work).filter(Work.id == wid, Work.owner_id == user.id).first()
    if not work:
        raise HTTPException(status_code=404, detail="Work not found")
    post = db.query(Post).filter(Post.work_id == wid, Post.visibility == "public").first()
    if not post:
        raise HTTPException(status_code=400, detail="应战作品需已发布")

    duel.opponent_id = user.id
    duel.opponent_work_id = wid
    duel.status = "voting"
    duel.vote_ends_at = datetime.utcnow() + timedelta(hours=DUEL_VOTE_HOURS)
    db.commit()

    from app.services.notifications import notify_duel_accepted

    notify_duel_accepted(db, duel.challenger_id, opponent_username=user.username, duel_id=str(duel.id))

    from app.services.cache import invalidate_discovery_caches

    invalidate_discovery_caches()
    return {"duel_id": str(duel.id), "status": duel.status, "vote_ends_at": duel.vote_ends_at.isoformat()}


def cast_duel_vote(
    db: Session,
    user: User,
    duel_id: str,
    *,
    side: str,
    listen_ratio: float,
    emotion_tag: str | None = None,
) -> dict[str, Any]:
    if side not in ("a", "b"):
        raise HTTPException(status_code=400, detail="side must be a or b")
    if listen_ratio < 0.5:
        raise HTTPException(status_code=400, detail="需要试听至少 50% 才能投票")

    try:
        did = uuid.UUID(duel_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid duel_id") from exc

    duel = db.query(Duel).filter(Duel.id == did).first()
    if not duel or duel.status != "voting":
        raise HTTPException(status_code=400, detail="决斗不在投票期")
    if duel.vote_ends_at and datetime.utcnow() > duel.vote_ends_at:
        raise HTTPException(status_code=400, detail="投票已结束")
    if user.id in (duel.challenger_id, duel.opponent_id):
        raise HTTPException(status_code=400, detail="参赛者不能投票")

    existing = db.query(DuelVote).filter(DuelVote.duel_id == did, DuelVote.user_id == user.id).first()
    if existing:
        raise HTTPException(status_code=400, detail="已投过票")

    vote = DuelVote(
        duel_id=did,
        user_id=user.id,
        side=side,
        listen_ratio=listen_ratio,
        emotion_tag=emotion_tag,
    )
    db.add(vote)
    if side == "a":
        duel.challenger_votes += 1
    else:
        duel.opponent_votes += 1
    _refresh_duel_resonance(db, duel)
    db.commit()
    return {"voted": True, "side": side}


def settle_duel(db: Session, duel: Duel) -> dict[str, Any]:
    if duel.status != "voting":
        return {"skipped": True}

    challenger_work = db.query(Work).filter(Work.id == duel.challenger_work_id).first()
    opponent_work = db.query(Work).filter(Work.id == duel.opponent_work_id).first()
    if not challenger_work or not opponent_work:
        duel.status = "cancelled"
        db.commit()
        return {"cancelled": True}

    _refresh_duel_resonance(db, duel)
    avg_res_a = duel.challenger_resonance or 0.5
    avg_res_b = duel.opponent_resonance or 0.5
    votes_a = duel.challenger_votes or 0
    votes_b = duel.opponent_votes or 0
    total_votes = max(1, votes_a + votes_b)
    score_a = (votes_a / total_votes) * 0.7 + avg_res_a * 0.3
    score_b = (votes_b / total_votes) * 0.7 + avg_res_b * 0.3

    if abs(score_a - score_b) < 0.05:
        winner_id = None
        duel.status = "draw"
    elif score_a > score_b:
        winner_id = duel.challenger_id
        duel.status = "settled"
        duel.winner_id = winner_id
    else:
        winner_id = duel.opponent_id
        duel.status = "settled"
        duel.winner_id = winner_id

    duel.settled_at = datetime.utcnow()

    if winner_id:
        grant_credits_with_transaction(
            db,
            winner_id,
            WINNER_CREDITS,
            source="duel_win",
            commit=False,
        )
        loser_id = duel.opponent_id if winner_id == duel.challenger_id else duel.challenger_id
        if loser_id:
            grant_credits_with_transaction(
                db,
                loser_id,
                LOSER_CREDITS,
                source="duel_lose",
                commit=False,
            )
    else:
        for uid in (duel.challenger_id, duel.opponent_id):
            if uid:
                grant_credits_with_transaction(
                    db,
                    uid,
                    LOSER_CREDITS,
                    source="duel_draw",
                    commit=False,
                )

    db.commit()

    from app.services.notifications import notify_duel_result

    notify_duel_result(db, duel)
    return {"settled": True, "winner_id": str(winner_id) if winner_id else None}


def settle_expired_duels(db: Session) -> int:
    now = datetime.utcnow()
    rows = (
        db.query(Duel)
        .filter(Duel.status == "voting", Duel.vote_ends_at.isnot(None), Duel.vote_ends_at <= now)
        .all()
    )
    count = 0
    for duel in rows:
        settle_duel(db, duel)
        count += 1
    return count


def list_duels(db: Session, *, status: str | None = None, limit: int = 20) -> list[dict[str, Any]]:
    query = db.query(Duel).order_by(Duel.created_at.desc())
    if status:
        query = query.filter(Duel.status == status)
    rows = query.limit(limit).all()
    out = []
    for d in rows:
        challenger = db.query(User).filter(User.id == d.challenger_id).first()
        opponent = db.query(User).filter(User.id == d.opponent_id).first() if d.opponent_id else None
        cw = db.query(Work).filter(Work.id == d.challenger_work_id).first()
        ow = db.query(Work).filter(Work.id == d.opponent_work_id).first() if d.opponent_work_id else None
        winner = db.query(User).filter(User.id == d.winner_id).first() if d.winner_id else None
        out.append(
            {
                "id": str(d.id),
                "status": d.status,
                "theme": d.theme,
                "challenger": challenger.username if challenger else None,
                "opponent": opponent.username if opponent else None,
                "challenger_work": _work_payload(cw),
                "opponent_work": _work_payload(ow),
                "challenger_votes": d.challenger_votes,
                "opponent_votes": d.opponent_votes,
                "vote_ends_at": d.vote_ends_at.isoformat() if d.vote_ends_at else None,
                "winner_id": str(d.winner_id) if d.winner_id else None,
                "winner": winner.username if winner else None,
            }
        )
    return out


def get_duel(db: Session, duel_id: str) -> dict[str, Any]:
    try:
        did = uuid.UUID(duel_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid duel_id") from exc
    duel = db.query(Duel).filter(Duel.id == did).first()
    if not duel:
        raise HTTPException(status_code=404, detail="Duel not found")

    challenger = db.query(User).filter(User.id == duel.challenger_id).first()
    opponent = db.query(User).filter(User.id == duel.opponent_id).first() if duel.opponent_id else None
    cw = db.query(Work).filter(Work.id == duel.challenger_work_id).first()
    ow = db.query(Work).filter(Work.id == duel.opponent_work_id).first() if duel.opponent_work_id else None
    winner = db.query(User).filter(User.id == duel.winner_id).first() if duel.winner_id else None
    return {
        "id": str(duel.id),
        "status": duel.status,
        "theme": duel.theme,
        "challenger": challenger.username if challenger else None,
        "opponent": opponent.username if opponent else None,
        "challenger_work": _work_payload(cw),
        "opponent_work": _work_payload(ow),
        "challenger_votes": duel.challenger_votes,
        "opponent_votes": duel.opponent_votes,
        "challenger_resonance": round(duel.challenger_resonance or 0, 3),
        "opponent_resonance": round(duel.opponent_resonance or 0, 3),
        "vote_ends_at": duel.vote_ends_at.isoformat() if duel.vote_ends_at else None,
        "winner_id": str(duel.winner_id) if duel.winner_id else None,
        "winner": winner.username if winner else None,
        "can_accept": duel.status in ("pending", "open"),
    }


def grant_duel_pass_starts(db: Session, user_id: uuid.UUID, starts: int = 10) -> None:
    quota = _get_or_create_quota(db, user_id)
    quota.pass_starts_remaining = (quota.pass_starts_remaining or 0) + starts
    db.commit()
