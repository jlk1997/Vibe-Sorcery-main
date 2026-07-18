from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.rate_limits import check_login_rate_limit, check_register_rate_limit
from app.api.schemas import TokenResponse, UserLogin, UserRegister, UserResponse
from app.database import get_db
from app.models.schemas import Tenant, User
from app.services.auth import authenticate_user, create_access_token, hash_password
from app.services.legal import apply_registration_consents, require_registration_consents

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse)
def register(payload: UserRegister, request: Request, db: Session = Depends(get_db)):
    check_register_rate_limit(request)
    require_registration_consents(payload.accepted_terms_version, payload.accepted_privacy_version)
    email = payload.email.strip().lower()
    username = payload.username.strip()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(status_code=400, detail="Username already taken")

    user = User(
        email=email,
        username=username,
        hashed_password=hash_password(payload.password),
        display_name=payload.display_name or username,
    )
    if payload.invite_code:
        tenant = db.query(Tenant).filter(Tenant.invite_code == payload.invite_code.strip()).first()
        if tenant:
            user.tenant_id = tenant.id
    db.add(user)
    db.flush()
    apply_registration_consents(
        db,
        user,
        payload.accepted_terms_version,
        payload.accepted_privacy_version,
        request=request,
    )
    from app.services.credits import grant_welcome_credits
    from app.services.growth import apply_referral_on_signup, ensure_referral_code

    grant_welcome_credits(db, user.id)
    referral_result = apply_referral_on_signup(db, user, payload.referral_code)
    ensure_referral_code(db, user)
    db.commit()
    db.refresh(user)
    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
def login(payload: UserLogin, request: Request, db: Session = Depends(get_db)):
    check_login_rate_limit(request, payload.email)
    user = authenticate_user(db, payload.email.strip(), payload.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return TokenResponse(access_token=create_access_token(str(user.id)))


@router.get("/me", response_model=UserResponse)
def me(user: User = Depends(get_current_user)):
    from app.services.legal import consent_status

    status = consent_status(user)
    return UserResponse(
        id=str(user.id),
        email=user.email,
        username=user.username,
        display_name=user.display_name,
        bio=user.bio,
        avatar_url=user.avatar_url,
        tenant_id=user.tenant_id,
        is_tenant_admin=bool(user.is_tenant_admin),
        is_admin=bool(user.is_admin),
        deletion_scheduled_at=status.get("deletion_scheduled_at"),
        consent_missing=status.get("missing", []),
    )
