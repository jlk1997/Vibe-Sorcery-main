from pydantic import BaseModel, Field

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_optional_user
from app.database import get_db
from app.models.schemas import User
from app.services.cache import cache_get, cache_set
from app.services.legal import consent_status, get_required_versions, list_documents, record_consent, revoke_analytics_consent

router = APIRouter(prefix="/legal", tags=["legal"])

LEGAL_META_TTL = 3600
LEGAL_DOCS_TTL = 3600


class ConsentRecord(BaseModel):
    consent_type: str = Field(description="terms | privacy | ai_notice | wechat_privacy | analytics")
    version: str | None = None


class ConsentUpdate(BaseModel):
    analytics_consent: bool | None = None
    consents: list[ConsentRecord] = []


def _cached_json(key: str, ttl: int, builder):
    hit = cache_get(key)
    if hit is not None:
        return JSONResponse(content=hit, headers={"Cache-Control": f"public, max-age={ttl}"})
    data = builder()
    cache_set(key, data, ttl)
    return JSONResponse(content=data, headers={"Cache-Control": f"public, max-age={ttl}"})


@router.get("/meta")
def get_legal_meta_endpoint():
    from app.services.legal import get_legal_meta

    return _cached_json("legal:meta", LEGAL_META_TTL, get_legal_meta)


@router.get("/documents")
def get_documents():
    return _cached_json(
        "legal:documents",
        LEGAL_DOCS_TTL,
        lambda: {
            "documents": list_documents(),
            "required_versions": get_required_versions(),
        },
    )


@router.get("/documents/{slug}")
def get_document_content(slug: str):
    from app.services.legal import get_document

    return _cached_json(f"legal:doc:{slug}", LEGAL_DOCS_TTL, lambda: get_document(slug))


@router.get("/consents/status")
def get_consent_status(user: User | None = Depends(get_optional_user)):
    return consent_status(user)


@router.post("/consents")
def post_consents(
    payload: ConsentUpdate,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    for item in payload.consents:
        record_consent(db, user, item.consent_type, item.version, request=request)
    if payload.analytics_consent is False:
        revoke_analytics_consent(db, user, request=request)
    elif payload.analytics_consent is True:
        record_consent(db, user, "analytics", "n/a", request=request)
    db.commit()
    db.refresh(user)
    return consent_status(user)
