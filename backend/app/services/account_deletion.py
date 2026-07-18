"""Account deletion and data export (PIPL)."""

from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.schemas import (
    CreditTransaction,
    Follow,
    Post,
    User,
    UserPreference,
    WeChatUser,
    Work,
)
from app.services.auth import verify_password

DELETION_GRACE_DAYS = 30


def export_user_data(db: Session, user: User) -> dict:
    pref = db.query(UserPreference).filter(UserPreference.user_id == user.id).first()
    works = db.query(Work).filter(Work.owner_id == user.id).limit(200).all()
    posts = db.query(Post).filter(Post.author_id == user.id).limit(200).all()
    txs = (
        db.query(CreditTransaction)
        .filter(CreditTransaction.user_id == user.id)
        .order_by(CreditTransaction.created_at.desc())
        .limit(100)
        .all()
    )
    return {
        "profile": {
            "id": str(user.id),
            "email": user.email,
            "username": user.username,
            "display_name": user.display_name,
            "bio": user.bio,
            "created_at": user.created_at.isoformat() if user.created_at else None,
        },
        "preferences": {
            "mood_tags": (pref.mood_tags if pref else []) or [],
            "genre_tags": (pref.genre_tags if pref else []) or [],
            "analytics_consent": bool(user.analytics_consent),
        },
        "works_count": len(works),
        "works": [
            {"id": str(w.id), "title": w.title, "visibility": w.visibility, "created_at": w.created_at.isoformat() if w.created_at else None}
            for w in works
        ],
        "posts_count": len(posts),
        "credit_transactions": [
            {
                "id": str(t.id),
                "credits": t.credits,
                "source": t.source,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }
            for t in txs
        ],
        "exported_at": datetime.utcnow().isoformat(),
    }


def schedule_account_deletion(db: Session, user: User, password: str | None = None) -> dict:
    if user.deleted_at:
        raise HTTPException(status_code=400, detail="Account already deleted")
    if user.deletion_scheduled_at:
        raise HTTPException(status_code=400, detail="Account deletion already scheduled")

    # WeChat users have random password; allow deletion without password if email is wechat.local
    is_wechat_account = user.email.endswith("@wechat.local")
    if not is_wechat_account:
        if not password:
            raise HTTPException(status_code=400, detail="Password required")
        if not verify_password(password, user.hashed_password):
            raise HTTPException(status_code=401, detail="Invalid password")

    now = datetime.utcnow()
    user.deletion_scheduled_at = now
    db.commit()
    return {
        "scheduled": True,
        "deletion_at": (now + timedelta(days=DELETION_GRACE_DAYS)).isoformat(),
        "grace_days": DELETION_GRACE_DAYS,
    }


def cancel_account_deletion(db: Session, user: User) -> dict:
    if not user.deletion_scheduled_at:
        raise HTTPException(status_code=400, detail="No pending deletion")
    user.deletion_scheduled_at = None
    user.is_active = True
    db.commit()
    return {"cancelled": True}


def finalize_pending_deletions(db: Session) -> int:
    """Cascade delete accounts past grace period. Call from Celery beat or admin."""
    cutoff = datetime.utcnow() - timedelta(days=DELETION_GRACE_DAYS)
    pending = (
        db.query(User)
        .filter(User.deletion_scheduled_at.isnot(None))
        .filter(User.deletion_scheduled_at <= cutoff)
        .filter(User.deleted_at.is_(None))
        .all()
    )
    count = 0
    for user in pending:
        _cascade_delete_user(db, user)
        count += 1
    if count:
        db.commit()
    return count


def _cascade_delete_user(db: Session, user: User) -> None:
    now = datetime.utcnow()
    user.deleted_at = now
    user.is_active = False
    user.email = f"deleted_{user.id}@deleted.local"
    user.username = f"deleted_{str(user.id)[:8]}"
    user.display_name = "已注销用户"
    user.bio = None
    user.avatar_url = None
    user.hashed_password = "deleted"

    db.query(WeChatUser).filter(WeChatUser.user_id == user.id).delete()
    db.query(Follow).filter((Follow.follower_id == user.id) | (Follow.following_id == user.id)).delete()

    works = db.query(Work).filter(Work.owner_id == user.id).all()
    for work in works:
        work.visibility = "private"
        work.title = "已注销用户的作品"

    posts = db.query(Post).filter(Post.author_id == user.id).all()
    for post in posts:
        post.visibility = "private"
        post.caption = None

    pref = db.query(UserPreference).filter(UserPreference.user_id == user.id).first()
    if pref:
        pref.mood_tags = []
        pref.genre_tags = []

    from app.models.schemas import UserSubscription

    sub = db.query(UserSubscription).filter(UserSubscription.user_id == user.id).first()
    if sub:
        sub.status = "cancelled"
