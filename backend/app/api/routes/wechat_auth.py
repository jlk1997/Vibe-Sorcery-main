from pydantic import BaseModel, Field

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.api.rate_limits import check_login_rate_limit
from app.database import get_db
from app.services.wechat import login_with_code

router = APIRouter(prefix="/auth/wechat", tags=["auth"])


class WeChatLoginRequest(BaseModel):
    code: str = Field(min_length=1)
    accepted_terms_version: str | None = None
    accepted_privacy_version: str | None = None


@router.post("/login")
async def wechat_login(payload: WeChatLoginRequest, request: Request, db: Session = Depends(get_db)):
    check_login_rate_limit(request)
    from app.services.legal import apply_registration_consents, require_registration_consents

    if payload.accepted_terms_version and payload.accepted_privacy_version:
        require_registration_consents(payload.accepted_terms_version, payload.accepted_privacy_version)
    result = await login_with_code(
        db,
        payload.code,
        terms_version=payload.accepted_terms_version,
        privacy_version=payload.accepted_privacy_version,
        request=request,
    )
    return result
