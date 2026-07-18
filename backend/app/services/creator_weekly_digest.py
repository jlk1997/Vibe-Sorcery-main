"""Creator weekly digest notifications."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.schemas import ChallengeEntry, CreatorTip, Duel, ListenCheckin, Post, User, Work


def send_creator_weekly_digests(db: Session) -> int:
    """Notify creators with meaningful activity in the past 7 days."""
    since = datetime.utcnow() - timedelta(days=7)
    sent = 0

    listen_rows = (
        db.query(ListenCheckin.work_id, func.count(ListenCheckin.id))
        .filter(ListenCheckin.created_at >= since)
        .group_by(ListenCheckin.work_id)
        .all()
    )
    work_listen: dict[uuid.UUID, int] = {wid: int(cnt) for wid, cnt in listen_rows}

    owner_ids: set[uuid.UUID] = set()
    if work_listen:
        works = db.query(Work.id, Work.owner_id).filter(Work.id.in_(work_listen.keys())).all()
        for wid, owner_id in works:
            if owner_id and work_listen.get(wid, 0) >= 3:
                owner_ids.add(owner_id)

    tip_owners = (
        db.query(Work.owner_id)
        .join(CreatorTip, CreatorTip.work_id == Work.id)
        .filter(CreatorTip.created_at >= since)
        .distinct()
        .all()
    )
    for (oid,) in tip_owners:
        if oid:
            owner_ids.add(oid)

    duel_users = (
        db.query(Duel.challenger_id, Duel.opponent_id)
        .filter(Duel.created_at >= since)
        .all()
    )
    for challenger_id, opponent_id in duel_users:
        if challenger_id:
            owner_ids.add(challenger_id)
        if opponent_id:
            owner_ids.add(opponent_id)

    from app.services.notifications import create_notification

    for uid in owner_ids:
        user = db.query(User).filter(User.id == uid).first()
        if not user:
            continue
        published = db.query(Post).filter(Post.author_id == uid, Post.created_at >= since).count()
        listens = sum(
            work_listen.get(w.id, 0)
            for w in db.query(Work).filter(Work.owner_id == uid).all()
        )
        tips = (
            db.query(func.coalesce(func.sum(CreatorTip.credits), 0))
            .join(Work, Work.id == CreatorTip.work_id)
            .filter(Work.owner_id == uid, CreatorTip.created_at >= since)
            .scalar()
        ) or 0
        my_work_ids = [w.id for w in db.query(Work.id).filter(Work.owner_id == uid).all()]
        remix_count = 0
        if my_work_ids:
            remix_count = (
                db.query(Work)
                .filter(Work.parent_work_id.in_(my_work_ids), Work.created_at >= since)
                .count()
            )
        if listens < 3 and int(tips) == 0 and published == 0 and remix_count == 0:
            continue
        create_notification(
            db,
            uid,
            "creator_weekly",
            {
                "listens": listens,
                "tips": int(tips),
                "published": published,
                "remixes": remix_count,
                "message": f"本周你的作品被完整试听 {listens} 次，收到打赏 {int(tips)} 额度",
            },
        )
        try:
            from app.services.wechat_subscribe import try_notify_creator_weekly

            try_notify_creator_weekly(
                db,
                uid,
                message=f"试听{listens}次·打赏{int(tips)}额度",
            )
        except Exception:
            pass
        sent += 1
    return sent


def get_creator_weekly_summary(db: Session, user_id: uuid.UUID) -> dict[str, int]:
    """Return creator activity stats for the past 7 days (same metrics as weekly digest)."""
    since = datetime.utcnow() - timedelta(days=7)

    listen_rows = (
        db.query(ListenCheckin.work_id, func.count(ListenCheckin.id))
        .filter(ListenCheckin.created_at >= since)
        .group_by(ListenCheckin.work_id)
        .all()
    )
    work_listen: dict[uuid.UUID, int] = {wid: int(cnt) for wid, cnt in listen_rows}

    my_work_ids = [w.id for w in db.query(Work.id).filter(Work.owner_id == user_id).all()]
    listens = sum(work_listen.get(wid, 0) for wid in my_work_ids)

    tips = 0
    if my_work_ids:
        tips = int(
            db.query(func.coalesce(func.sum(CreatorTip.credits), 0))
            .filter(CreatorTip.work_id.in_(my_work_ids), CreatorTip.created_at >= since)
            .scalar()
            or 0
        )

    published = db.query(Post).filter(Post.author_id == user_id, Post.created_at >= since).count()

    remix_count = 0
    if my_work_ids:
        remix_count = (
            db.query(Work)
            .filter(Work.parent_work_id.in_(my_work_ids), Work.created_at >= since)
            .count()
        )

    duel_mentions = (
        db.query(Duel)
        .filter(
            Duel.created_at >= since,
            (Duel.challenger_id == user_id) | (Duel.opponent_id == user_id),
        )
        .count()
    )

    return {
        "listens": listens,
        "tips": tips,
        "published": published,
        "remixes": remix_count,
        "duel_mentions": duel_mentions,
    }
