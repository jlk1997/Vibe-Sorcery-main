"""User API keys for programmatic access."""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.schemas import User, UserApiKey

KEY_PREFIX = "vsk_"


def _hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def create_api_key(
    db: Session,
    user_id: uuid.UUID,
    name: str,
    scopes: list[str] | None = None,
) -> tuple[str, UserApiKey]:
    raw = KEY_PREFIX + secrets.token_urlsafe(32)
    row = UserApiKey(
        user_id=user_id,
        name=name.strip() or "Default",
        key_prefix=raw[:12],
        key_hash=_hash_key(raw),
        scopes=scopes or ["read", "generate"],
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return raw, row


def authenticate_api_key(db: Session, raw_key: str) -> User | None:
    if not raw_key.startswith(KEY_PREFIX):
        return None
    row = (
        db.query(UserApiKey)
        .filter(UserApiKey.key_hash == _hash_key(raw_key), UserApiKey.revoked_at.is_(None))
        .first()
    )
    if not row:
        return None
    user = db.query(User).filter(User.id == row.user_id, User.is_active == True).first()
    if not user:
        return None
    row.last_used_at = datetime.utcnow()
    db.commit()
    scopes = row.scopes if isinstance(row.scopes, list) else ["read", "generate"]
    setattr(user, "api_key_scopes", scopes)
    setattr(user, "api_key_id", str(row.id))
    return user


def list_api_keys(db: Session, user_id: uuid.UUID) -> list[UserApiKey]:
    return (
        db.query(UserApiKey)
        .filter(UserApiKey.user_id == user_id, UserApiKey.revoked_at.is_(None))
        .order_by(UserApiKey.created_at.desc())
        .all()
    )


def revoke_api_key(db: Session, user_id: uuid.UUID, key_id: uuid.UUID) -> bool:
    row = (
        db.query(UserApiKey)
        .filter(UserApiKey.id == key_id, UserApiKey.user_id == user_id, UserApiKey.revoked_at.is_(None))
        .first()
    )
    if not row:
        return False
    row.revoked_at = datetime.utcnow()
    db.commit()
    return True
