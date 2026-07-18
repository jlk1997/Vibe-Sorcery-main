import uuid
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.schemas import User
from app.services.auth import decode_token
from app.services.api_keys import authenticate_api_key, KEY_PREFIX
from app.services.rate_limit import check_rate_limit

security = HTTPBearer(auto_error=False)


def _parse_user_id(raw: str) -> uuid.UUID:
    try:
        return uuid.UUID(raw)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        ) from exc


def _user_from_bearer_token(token: str, db: Session) -> User | None:
    if token.startswith(KEY_PREFIX):
        user = authenticate_api_key(db, token)
        if user is not None:
            key_id = getattr(user, "api_key_id", "unknown")
            check_rate_limit(f"api_key:{key_id}")
        return user
    user_id = decode_token(token)
    if not user_id:
        return None
    user = db.query(User).filter(User.id == _parse_user_id(user_id)).first()
    if not user or not user.is_active or user.deleted_at:
        return None
    return user


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    user = _user_from_bearer_token(credentials.credentials, db)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    return user


def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> Optional[User]:
    if credentials is None:
        return None
    return _user_from_bearer_token(credentials.credentials, db)


def authenticate_token(token: str, db: Session) -> User | None:
    return _user_from_bearer_token(token, db)


def require_admin(user: User = Depends(get_current_user)) -> User:
    if not getattr(user, "is_admin", False):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin required")
    return user


def require_tenant_admin(user: User = Depends(get_current_user)) -> User:
    from app.services.tenant import is_tenant_admin_user

    if not is_tenant_admin_user(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant admin required")
    return user


def require_scope(scope: str):
    """Enforce API key scope; JWT sessions bypass scope checks."""

    def _dep(user: User = Depends(get_current_user)) -> User:
        scopes = getattr(user, "api_key_scopes", None)
        if scopes is None:
            return user
        if scope in scopes or "admin" in scopes:
            return user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"API key missing required scope: {scope}",
        )

    return _dep


ALLOWED_API_SCOPES = frozenset({"read", "generate", "feed", "admin"})


def validate_api_scopes(scopes: list[str]) -> list[str]:
    cleaned = [s.strip() for s in scopes if s and s.strip()]
    if not cleaned:
        return ["read"]
    invalid = set(cleaned) - ALLOWED_API_SCOPES
    if invalid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid API key scopes: {', '.join(sorted(invalid))}",
        )
    return cleaned
