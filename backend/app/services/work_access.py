import uuid

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.schemas import User, Work

MAX_UPLOAD_BYTES = 50 * 1024 * 1024


def parse_uuid(value: str, *, field: str = "id") -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid {field}") from exc


def can_view_work(work: Work, user: User | None) -> bool:
    if work.visibility in ("public", "unlisted"):
        return True
    return user is not None and work.owner_id == user.id


def _resolve_owner_id(user: User | uuid.UUID) -> uuid.UUID:
    return user.id if isinstance(user, User) else user


def can_use_work_as_seed(work: Work, user: User | uuid.UUID, db: Session | None = None) -> bool:
    owner_id = _resolve_owner_id(user)
    if work.owner_id == owner_id:
        return True
    from app.services.tenant import is_multi_tenant_enabled, tenant_id_for_user

    resolved_user = user if isinstance(user, User) else None
    if resolved_user is None and db is not None:
        resolved_user = db.query(User).filter(User.id == owner_id).first()
    if resolved_user and is_multi_tenant_enabled(db) and work.tenant_id != tenant_id_for_user(resolved_user):
        return False
    return work.visibility == "public"


def can_remix_work(work: Work) -> bool:
    if work.allow_remix is False:
        return False
    license_key = (work.license or "allow_remix").lower()
    if license_key in ("no_derivatives", "no_remix"):
        return False
    return True


def requires_attribution(work: Work) -> bool:
    license_key = (work.license or "allow_remix").lower()
    return license_key in ("attribution", "attribution_required")


def get_owned_work(db: Session, work_id: str, user: User) -> Work:
    work = db.query(Work).filter(Work.id == parse_uuid(work_id, field="work_id")).first()
    if not work:
        raise HTTPException(status_code=404, detail="Work not found")
    if work.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return work


def get_viewable_work(db: Session, work_id: str, user: User) -> Work:
    work = db.query(Work).filter(Work.id == parse_uuid(work_id, field="work_id")).first()
    if not work:
        raise HTTPException(status_code=404, detail="Work not found")
    if not can_view_work(work, user):
        raise HTTPException(status_code=403, detail="Forbidden")
    return work


def get_viewable_work_optional(db: Session, work_id: str, user: User | None) -> Work:
    work = db.query(Work).filter(Work.id == parse_uuid(work_id, field="work_id")).first()
    if not work:
        raise HTTPException(status_code=404, detail="Work not found")
    if not can_view_work(work, user):
        raise HTTPException(status_code=403, detail="Forbidden")
    return work


def get_work_or_404(db: Session, work_id: str) -> Work:
    """Fetch a work by id without view gating.

    For media streaming endpoints (audio/HLS) the request carries no auth header,
    so authorization is delegated to the short-lived playback ticket via
    ``validate_playback_access``. View permission must NOT be enforced here or a
    valid ticket could never grant access to a private/just-generated work.
    """
    work = db.query(Work).filter(Work.id == parse_uuid(work_id, field="work_id")).first()
    if not work:
        raise HTTPException(status_code=404, detail="Work not found")
    return work


def get_seed_work(db: Session, work_id: str, user: User) -> Work:
    work = db.query(Work).filter(Work.id == parse_uuid(work_id, field="work_id")).first()
    if not work:
        raise HTTPException(status_code=404, detail="Seed work not found")
    if not can_use_work_as_seed(work, user, db):
        raise HTTPException(status_code=403, detail="Cannot use this work as seed")
    return work
