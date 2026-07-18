"""User engagement: daily check-in, task rewards, creator progress."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.models.schemas import ChallengeEntry, Post, User, UserDailyCheckin, UserTaskProgress, Work
from app.services.credits import grant_credits_with_transaction

TASK_DEFS: dict[str, dict] = {
    "first_publish": {
        "label": "首次发布作品",
        "credits": lambda: settings.task_credits_first_publish,
    },
    "journey_feedback": {
        "label": "完成旅程反馈",
        "credits": lambda: settings.task_credits_journey_feedback,
    },
    "first_remix": {
        "label": "首次 Remix 他人作品",
        "credits": lambda: settings.task_credits_first_remix,
    },
    "first_challenge": {
        "label": "首次参加挑战",
        "credits": lambda: settings.task_credits_first_challenge,
    },
}

WEEKLY_TASK_POOL: list[dict] = [
    {"key": "weekly_listen_3", "label": "本周试听 3 首社区作品", "credits": 2},
    {"key": "weekly_remix_1", "label": "本周完成 1 次 Remix", "credits": 3},
    {"key": "weekly_publish_1", "label": "本周发布 1 首作品", "credits": 3},
    {"key": "weekly_journey_1", "label": "本周完成 1 次心情旅程", "credits": 2},
]


def _active_weekly_task() -> dict:
    week = date.today().isocalendar()[1]
    return WEEKLY_TASK_POOL[week % len(WEEKLY_TASK_POOL)]


def _creator_level(published: int, remixes: int, challenge_entries: int) -> str:
    score = published * 3 + remixes + challenge_entries * 2
    if score >= 30:
        return "gold"
    if score >= 10:
        return "silver"
    if score >= 3:
        return "bronze"
    return "novice"


def batch_creator_levels(db: Session, user_ids: list[uuid.UUID]) -> dict[uuid.UUID, str]:
    if not user_ids:
        return {}
    from sqlalchemy import func

    published_rows = (
        db.query(Post.author_id, func.count(Post.id))
        .filter(Post.author_id.in_(user_ids))
        .group_by(Post.author_id)
        .all()
    )
    remix_rows = (
        db.query(Work.owner_id, func.count(Work.id))
        .filter(Work.owner_id.in_(user_ids), Work.parent_work_id.isnot(None))
        .group_by(Work.owner_id)
        .all()
    )
    challenge_rows = (
        db.query(ChallengeEntry.user_id, func.count(ChallengeEntry.id))
        .filter(ChallengeEntry.user_id.in_(user_ids))
        .group_by(ChallengeEntry.user_id)
        .all()
    )
    published = {uid: int(count) for uid, count in published_rows}
    remixes = {uid: int(count) for uid, count in remix_rows}
    challenges = {uid: int(count) for uid, count in challenge_rows}
    return {
        uid: _creator_level(published.get(uid, 0), remixes.get(uid, 0), challenges.get(uid, 0))
        for uid in user_ids
    }


def _checkin_streak(db: Session, user_id: uuid.UUID, *, through: date | None = None) -> int:
    through = through or date.today()
    rows = (
        db.query(UserDailyCheckin.checkin_date)
        .filter(UserDailyCheckin.user_id == user_id)
        .order_by(UserDailyCheckin.checkin_date.desc())
        .limit(60)
        .all()
    )
    dates = {row[0] for row in rows}
    streak = 0
    day = through
    while day in dates:
        streak += 1
        day -= timedelta(days=1)
    return streak


def daily_checkin(db: Session, user_id: uuid.UUID) -> dict:
    today = date.today()
    existing = (
        db.query(UserDailyCheckin)
        .filter(UserDailyCheckin.user_id == user_id, UserDailyCheckin.checkin_date == today)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Already checked in today")
    amount = settings.daily_checkin_credits
    prior_streak = _checkin_streak(db, user_id, through=date.today() - timedelta(days=1))
    streak_after = prior_streak + 1
    if streak_after >= 7 and streak_after % 7 == 0:
        amount *= 2
    row = grant_credits_with_transaction(
        db,
        user_id,
        amount,
        source="daily_checkin",
        external_id=f"checkin_{user_id}_{today.isoformat()}",
    )
    db.add(
        UserDailyCheckin(
            user_id=user_id,
            checkin_date=today,
            credits_granted=amount,
        )
    )
    db.commit()
    return {
        "credits_granted": amount,
        "balance": row.balance,
        "checkin_date": today.isoformat(),
        "streak_days": streak_after,
        "streak_bonus": streak_after >= 7 and streak_after % 7 == 0,
    }


def complete_task(db: Session, user_id: uuid.UUID, task_key: str) -> dict | None:
    if task_key not in TASK_DEFS:
        return None
    existing = (
        db.query(UserTaskProgress)
        .filter(UserTaskProgress.user_id == user_id, UserTaskProgress.task_key == task_key)
        .first()
    )
    if existing:
        return {"duplicate": True, "task_key": task_key}
    amount = int(TASK_DEFS[task_key]["credits"]())
    grant_credits_with_transaction(
        db,
        user_id,
        amount,
        source=f"task_{task_key}",
        external_id=f"task_{task_key}_{user_id}",
    )
    db.add(
        UserTaskProgress(
            user_id=user_id,
            task_key=task_key,
            credits_granted=amount,
            completed_at=datetime.utcnow(),
        )
    )
    db.commit()
    from app.services.credits import get_or_create_credits

    row = get_or_create_credits(db, user_id)
    return {"task_key": task_key, "credits_granted": amount, "balance": row.balance}


def _weekly_storage_key(base_key: str) -> str:
    return f"{base_key}_{date.today().isocalendar()[1]}"


def complete_weekly_task(db: Session, user_id: uuid.UUID, base_key: str) -> dict | None:
    """Award credits when the active weekly task matches base_key."""
    active = _active_weekly_task()
    if active["key"] != base_key:
        return None
    task_key = _weekly_storage_key(base_key)
    existing = (
        db.query(UserTaskProgress)
        .filter(UserTaskProgress.user_id == user_id, UserTaskProgress.task_key == task_key)
        .first()
    )
    if existing:
        return {"duplicate": True, "task_key": task_key}
    amount = int(active["credits"])
    grant_credits_with_transaction(
        db,
        user_id,
        amount,
        source=f"task_{task_key}",
        external_id=f"task_{task_key}_{user_id}",
    )
    db.add(
        UserTaskProgress(
            user_id=user_id,
            task_key=task_key,
            credits_granted=amount,
            completed_at=datetime.utcnow(),
        )
    )
    db.commit()
    from app.services.credits import get_or_create_credits

    row = get_or_create_credits(db, user_id)
    return {"task_key": task_key, "credits_granted": amount, "balance": row.balance, "weekly": True}


def _week_start() -> date:
    today = date.today()
    return today - timedelta(days=today.weekday())


def count_weekly_community_listens(db: Session, user_id: uuid.UUID) -> int:
    from app.models.schemas import AnalyticsEvent

    since = datetime.combine(_week_start(), datetime.min.time())
    rows = (
        db.query(AnalyticsEvent)
        .filter(
            AnalyticsEvent.user_id == user_id,
            AnalyticsEvent.created_at >= since,
            AnalyticsEvent.event.in_(("community_listen", "activation_first_listen")),
        )
        .all()
    )
    work_ids: set[str] = set()
    for row in rows:
        wid = (row.payload or {}).get("work_id")
        if wid:
            work_ids.add(str(wid))
    return len(work_ids)


def maybe_complete_weekly_listen(db: Session, user_id: uuid.UUID) -> dict | None:
    if count_weekly_community_listens(db, user_id) < 3:
        return None
    return complete_weekly_task(db, user_id, "weekly_listen_3")


def on_engagement_event(
    db: Session,
    user_id: uuid.UUID,
    event: str,
    payload: dict | None = None,
) -> dict | None:
    """Hook weekly/lifecycle tasks from analytics and product events."""
    payload = payload or {}
    if event == "community_listen":
        return maybe_complete_weekly_listen(db, user_id)
    if event == "work_published":
        return complete_weekly_task(db, user_id, "weekly_publish_1")
    if event in ("remix_started", "studio_remix_start"):
        return complete_weekly_task(db, user_id, "weekly_remix_1")
    if event in ("playlist_listen_complete", "journey_completed"):
        return complete_weekly_task(db, user_id, "weekly_journey_1")
    if event == "listen_complete_checkin":
        return maybe_complete_weekly_listen(db, user_id)
    return None


def get_user_progress(db: Session, user: User) -> dict:
    published = db.query(Post).filter(Post.author_id == user.id).count()
    remixes = (
        db.query(Work)
        .filter(Work.owner_id == user.id, Work.parent_work_id.isnot(None))
        .count()
    )
    challenge_entries = db.query(ChallengeEntry).filter(ChallengeEntry.user_id == user.id).count()
    tasks_done = {
        row.task_key: row.completed_at.isoformat() if row.completed_at else None
        for row in db.query(UserTaskProgress).filter(UserTaskProgress.user_id == user.id).all()
    }
    today = date.today()
    checked_in_today = (
        db.query(UserDailyCheckin)
        .filter(UserDailyCheckin.user_id == user.id, UserDailyCheckin.checkin_date == today)
        .first()
        is not None
    )
    level = _creator_level(published, remixes, challenge_entries)
    streak_days = _checkin_streak(db, user.id)
    pending_tasks = [
        {
            "key": key,
            "label": meta["label"],
            "credits": int(meta["credits"]()),
            "completed": key in tasks_done,
        }
        for key, meta in TASK_DEFS.items()
    ]
    weekly = _active_weekly_task()
    weekly_key = f"{weekly['key']}_{date.today().isocalendar()[1]}"
    pending_tasks.append(
        {
            "key": weekly_key,
            "label": weekly["label"],
            "credits": weekly["credits"],
            "completed": weekly_key in tasks_done,
            "weekly": True,
        }
    )
    return {
        "level": level,
        "stats": {
            "published": published,
            "remixes": remixes,
            "challenge_entries": challenge_entries,
        },
        "checked_in_today": checked_in_today,
        "streak_days": streak_days,
        "daily_checkin_credits": settings.daily_checkin_credits,
        "tasks": pending_tasks,
    }
