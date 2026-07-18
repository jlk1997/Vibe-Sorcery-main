from pydantic import BaseModel, Field

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, validate_api_scopes, get_optional_user
from app.api.routes.works import work_to_response
from app.api.schemas import PostResponse, PublicProfileResponse
from app.database import get_db
from app.models.schemas import Follow, User, UserPreference, Work
from app.services.feed import build_user_posts

router = APIRouter(prefix="/users", tags=["users"])


class PreferencesUpdate(BaseModel):
    mood_tags: list[str] = []
    genre_tags: list[str] = []


class ProfileUpdate(BaseModel):
    display_name: str | None = None
    bio: str | None = None


class DeleteAccountRequest(BaseModel):
    password: str | None = None
    confirm: bool = False


class ConsentsUpdate(BaseModel):
    analytics_consent: bool | None = None


@router.get("/me/preferences")
def get_preferences(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    pref = db.query(UserPreference).filter(UserPreference.user_id == user.id).first()
    if not pref:
        pref = UserPreference(user_id=user.id, mood_tags=[], genre_tags=[])
        db.add(pref)
        db.commit()
    return {"mood_tags": pref.mood_tags or [], "genre_tags": pref.genre_tags or []}


@router.put("/me/preferences")
def update_preferences(
    payload: PreferencesUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    pref = db.query(UserPreference).filter(UserPreference.user_id == user.id).first()
    if not pref:
        pref = UserPreference(user_id=user.id)
        db.add(pref)
    pref.mood_tags = payload.mood_tags
    pref.genre_tags = payload.genre_tags
    db.commit()
    return {"mood_tags": pref.mood_tags, "genre_tags": pref.genre_tags}


@router.get("/me/profile")
def get_my_profile(user: User = Depends(get_current_user)):
    return {
        "username": user.username,
        "display_name": user.display_name,
        "bio": user.bio,
        "avatar_url": user.avatar_url,
    }


@router.get("/me/credits")
def get_my_credits(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.services.credits import get_or_create_credits

    row = get_or_create_credits(db, user.id)
    return {"balance": row.balance}


@router.get("/me/credits/transactions")
def list_my_credit_transactions(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.services.credits import list_credit_transactions

    rows = list_credit_transactions(db, user.id, limit=40)
    return [
        {
            "id": str(r.id),
            "pack_id": r.pack_id,
            "credits": r.credits,
            "source": r.source,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.post("/me/checkin")
def user_daily_checkin(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.services.user_engagement import daily_checkin

    return daily_checkin(db, user.id)


@router.get("/me/progress")
def user_progress(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.services.user_engagement import get_user_progress

    return get_user_progress(db, user)


@router.get("/me/emotion-calendar")
def get_emotion_calendar(user: User = Depends(get_current_user), db: Session = Depends(get_db), days: int = 60):
    from app.services.emotion_calendar import list_entries

    return {"entries": list_entries(db, user.id, days=days)}


@router.get("/me/emotion-calendar/monthly")
def get_monthly_emotion_album(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    year: int | None = None,
    month: int | None = None,
):
    from app.services.emotion_calendar import monthly_album

    return monthly_album(db, user.id, year=year, month=month)


@router.post("/me/emotion-calendar")
def post_emotion_calendar(
    payload: dict,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.services.emotion_calendar import log_entry

    return log_entry(
        db,
        user.id,
        work_id=payload.get("work_id"),
        arousal=payload.get("arousal"),
        valence=payload.get("valence"),
        mood_tags=payload.get("mood_tags"),
        note=payload.get("note"),
    )


@router.get("/me/api-usage")
def get_api_usage(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from datetime import datetime

    from sqlalchemy import func

    from app.models.schemas import ApiUsageLog

    since = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    count = (
        db.query(func.count(ApiUsageLog.id))
        .filter(ApiUsageLog.user_id == user.id, ApiUsageLog.created_at >= since)
        .scalar()
    )
    return {"monthly_calls": int(count or 0), "quota": 1000}


@router.get("/me/referral")
def get_my_referral(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.services.growth import get_referral_stats

    return get_referral_stats(db, user)


@router.get("/me/creator-stats")
def get_creator_stats(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from sqlalchemy import func

    from app.models.schemas import ChallengeEntry, GenerationJob, Post, ProvenanceRecord

    works_total = db.query(Work).filter(Work.owner_id == user.id).count()
    published = db.query(Work).filter(Work.owner_id == user.id, Work.visibility == "public").count()
    remix_children = (
        db.query(ProvenanceRecord)
        .join(Work, Work.id == ProvenanceRecord.work_id)
        .filter(Work.owner_id == user.id, ProvenanceRecord.parent_work_id.isnot(None))
        .count()
    )
    likes = (
        db.query(func.coalesce(func.sum(Post.like_count), 0))
        .join(Work, Work.id == Post.work_id)
        .filter(Work.owner_id == user.id)
        .scalar()
    ) or 0
    jobs_30d = (
        db.query(GenerationJob)
        .filter(GenerationJob.owner_id == user.id, GenerationJob.status == "completed")
        .count()
    )
    challenge_entries = db.query(ChallengeEntry).filter(ChallengeEntry.user_id == user.id).count()
    followers = db.query(Follow).filter(Follow.following_id == user.id).count()

    my_work_ids = [row[0] for row in db.query(Work.id).filter(Work.owner_id == user.id).all()]
    remixes_received = (
        db.query(Work).filter(Work.parent_work_id.in_(my_work_ids)).count() if my_work_ids else 0
    )

    from datetime import datetime, timedelta

    since_7d = datetime.utcnow() - timedelta(days=7)
    likes_7d = (
        db.query(func.coalesce(func.sum(Post.like_count), 0))
        .join(Work, Work.id == Post.work_id)
        .filter(Work.owner_id == user.id, Post.created_at >= since_7d)
        .scalar()
    ) or 0

    return {
        "works_total": works_total,
        "published": published,
        "remix_derivatives": remix_children,
        "remixes_received": remixes_received,
        "total_likes": int(likes),
        "likes_7d": int(likes_7d),
        "completed_jobs": jobs_30d,
        "challenge_entries": challenge_entries,
        "followers": followers,
    }


@router.put("/me/profile")
def update_profile(
    payload: ProfileUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.services.content_moderation import moderate_profile_fields

    moderated = moderate_profile_fields(
        display_name=payload.display_name,
        bio=payload.bio,
        db=db,
    )
    if "display_name" in moderated:
        user.display_name = moderated["display_name"]
    if "bio" in moderated:
        user.bio = moderated["bio"]
    db.commit()
    return {"display_name": user.display_name, "bio": user.bio, "avatar_url": user.avatar_url}


class AvatarUploadRequest(BaseModel):
    content_type: str = Field(default="image/jpeg", pattern=r"^image/(jpeg|png|webp)$")


class AvatarConfirmRequest(BaseModel):
    storage_key: str = Field(min_length=8, max_length=512)


@router.post("/me/avatar/upload-url")
def create_avatar_upload_url(
    payload: AvatarUploadRequest,
    user: User = Depends(get_current_user),
):
    from app.services.storage import get_storage_service

    ext = "jpg" if "jpeg" in payload.content_type else payload.content_type.split("/")[-1]
    storage = get_storage_service()
    key = storage.generate_avatar_key(str(user.id), ext)
    upload_url = storage.get_presigned_put_url(key, content_type=payload.content_type)
    return {"storage_key": key, "upload_url": upload_url}


@router.post("/me/avatar/confirm")
def confirm_avatar_upload(
    payload: AvatarConfirmRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.services.storage import get_storage_service

    if not payload.storage_key.startswith(f"avatars/{user.id}/"):
        raise HTTPException(status_code=400, detail="Invalid avatar key")
    storage = get_storage_service()
    user.avatar_url = storage.get_presigned_url(payload.storage_key)
    db.commit()
    return {"avatar_url": user.avatar_url}


class ApiKeyCreate(BaseModel):
    name: str = "Default"
    scopes: list[str] = Field(default_factory=lambda: ["read", "generate"])


@router.get("/me/api-keys")
def list_my_api_keys(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.services import api_keys as api_key_service

    rows = api_key_service.list_api_keys(db, user.id)
    return [
        {
            "id": str(r.id),
            "name": r.name,
            "key_prefix": r.key_prefix,
            "scopes": r.scopes if isinstance(r.scopes, list) else ["read", "generate"],
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "last_used_at": r.last_used_at.isoformat() if r.last_used_at else None,
        }
        for r in rows
    ]


@router.post("/me/api-keys")
def create_my_api_key(
    payload: ApiKeyCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.services import api_keys as api_key_service

    raw, row = api_key_service.create_api_key(
        db, user.id, payload.name, scopes=validate_api_scopes(payload.scopes)
    )
    return {
        "id": str(row.id),
        "name": row.name,
        "key_prefix": row.key_prefix,
        "scopes": row.scopes if isinstance(row.scopes, list) else ["read", "generate"],
        "api_key": raw,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


@router.delete("/me/api-keys/{key_id}")
def revoke_my_api_key(
    key_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    import uuid

    from app.services import api_keys as api_key_service

    if not api_key_service.revoke_api_key(db, user.id, uuid.UUID(key_id)):
        raise HTTPException(status_code=404, detail="API key not found")
    return {"revoked": True}


class WebhookCreate(BaseModel):
    name: str = "Default"
    url: str
    events: list[str] | None = None


@router.get("/me/webhooks")
def list_my_webhooks(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.services import job_webhooks as wh_service

    rows = wh_service.list_webhooks(db, user.id)
    return [
        {
            "id": str(r.id),
            "name": r.name,
            "url": r.url,
            "events": r.events or wh_service.DEFAULT_EVENTS,
            "enabled": r.enabled,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "last_delivery_at": r.last_delivery_at.isoformat() if r.last_delivery_at else None,
            "last_error": r.last_error,
        }
        for r in rows
    ]


@router.post("/me/webhooks")
def create_my_webhook(
    payload: WebhookCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.services import job_webhooks as wh_service

    try:
        secret, row = wh_service.create_webhook(
            db,
            user.id,
            name=payload.name,
            url=payload.url,
            events=payload.events,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "id": str(row.id),
        "name": row.name,
        "url": row.url,
        "events": row.events or wh_service.DEFAULT_EVENTS,
        "secret": secret,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


@router.delete("/me/webhooks/{webhook_id}")
def delete_my_webhook(
    webhook_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    import uuid

    from app.services import job_webhooks as wh_service

    if not wh_service.delete_webhook(db, user.id, uuid.UUID(webhook_id)):
        raise HTTPException(status_code=404, detail="Webhook not found")
    return {"deleted": True}


@router.get("/me/export")
def export_my_data(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.services.account_deletion import export_user_data

    return export_user_data(db, user)


@router.post("/me/delete-account")
def delete_my_account(
    payload: DeleteAccountRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not payload.confirm:
        raise HTTPException(status_code=400, detail="Deletion confirmation required")
    from app.services.account_deletion import schedule_account_deletion

    return schedule_account_deletion(db, user, payload.password)


@router.post("/me/cancel-deletion")
def cancel_my_deletion(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.services.account_deletion import cancel_account_deletion

    return cancel_account_deletion(db, user)


@router.put("/me/consents")
def update_my_consents(
    payload: ConsentsUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.services.legal import record_consent, revoke_analytics_consent

    if payload.analytics_consent is True:
        record_consent(db, user, "analytics", "n/a")
    elif payload.analytics_consent is False:
        revoke_analytics_consent(db, user)
    db.commit()
    db.refresh(user)
    from app.services.legal import consent_status

    return consent_status(user)


@router.get("/{username}/profile", response_model=PublicProfileResponse)
def get_public_profile(
    username: str,
    viewer: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    works_count = db.query(Work).filter(Work.owner_id == user.id, Work.visibility == "public").count()
    followers = db.query(Follow).filter(Follow.following_id == user.id).count()
    following = db.query(Follow).filter(Follow.follower_id == user.id).count()

    is_following = None
    if viewer:
        is_following = (
            db.query(Follow)
            .filter(Follow.follower_id == viewer.id, Follow.following_id == user.id)
            .first()
            is not None
        )

    return PublicProfileResponse(
        username=user.username,
        display_name=user.display_name,
        bio=user.bio,
        avatar_url=user.avatar_url,
        stats={"works": works_count, "followers": followers, "following": following},
        is_following=is_following,
    )


@router.get("/{username}/works")
def get_public_works(username: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    works = (
        db.query(Work)
        .filter(Work.owner_id == user.id, Work.visibility == "public")
        .order_by(Work.created_at.desc())
        .limit(50)
        .all()
    )
    return [work_to_response(w) for w in works]


@router.get("/{username}/posts", response_model=list[PostResponse])
def get_user_posts(
    username: str,
    viewer: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return build_user_posts(db, author=user, viewer=viewer)


@router.get("/{username}/followers")
def list_followers(username: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    rows = (
        db.query(User)
        .join(Follow, Follow.follower_id == User.id)
        .filter(Follow.following_id == user.id)
        .order_by(Follow.created_at.desc())
        .limit(100)
        .all()
    )
    return [{"username": u.username, "display_name": u.display_name, "avatar_url": u.avatar_url} for u in rows]


@router.get("/{username}/following")
def list_following(username: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    rows = (
        db.query(User)
        .join(Follow, Follow.following_id == User.id)
        .filter(Follow.follower_id == user.id)
        .order_by(Follow.created_at.desc())
        .limit(100)
        .all()
    )
    return [{"username": u.username, "display_name": u.display_name, "avatar_url": u.avatar_url} for u in rows]
