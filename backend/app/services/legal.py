"""Legal document loading and consent management."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from app.models.schemas import User, UserConsentLog

LEGAL_ROOT = Path(__file__).resolve().parents[3] / "docs" / "legal" / "zh"

CONSENT_FIELD_MAP = {
    "terms": ("terms_accepted_at", "terms_version"),
    "privacy": ("privacy_accepted_at", "privacy_version"),
    "ai_notice": ("ai_notice_accepted_at", None),
    "wechat_privacy": ("wechat_privacy_authorized_at", None),
    "analytics": ("analytics_consent", None),
}


def _load_manifest() -> dict:
    manifest_path = LEGAL_ROOT / "manifest.json"
    if not manifest_path.exists():
        raise HTTPException(status_code=500, detail="Legal manifest not found")
    return json.loads(manifest_path.read_text(encoding="utf-8"))


def get_current_versions() -> dict[str, str]:
    manifest = _load_manifest()
    return {doc["slug"]: doc["version"] for doc in manifest.get("documents", [])}


def get_legal_meta() -> dict:
    manifest = _load_manifest()
    return {
        "company_name": manifest.get("company_name") or _legal_company_name(),
        "contact_email": manifest.get("contact_email"),
        "contact_phone": manifest.get("contact_phone"),
        "effective_date": manifest.get("effective_date"),
        "required_versions": get_required_versions(),
        "icp_number": _legal_icp_number(),
    }


def _legal_icp_number() -> str:
    from app.config import settings

    return settings.legal_icp_number or ""


def _legal_company_name() -> str:
    from app.config import settings

    return settings.legal_company_name or "炼金音坊"


def get_required_versions() -> dict[str, str]:
    manifest = _load_manifest()
    versions: dict[str, str] = {}
    for doc in manifest.get("documents", []):
        for consent_type in doc.get("required_for", []):
            versions[consent_type] = doc["version"]
    return versions


def list_documents() -> list[dict]:
    manifest = _load_manifest()
    return [
        {
            "slug": doc["slug"],
            "title": doc["title"],
            "version": doc["version"],
            "required_for": doc.get("required_for", []),
        }
        for doc in manifest.get("documents", [])
    ]


def get_document(slug: str) -> dict:
    manifest = _load_manifest()
    for doc in manifest.get("documents", []):
        if doc["slug"] == slug:
            file_path = LEGAL_ROOT / doc["file"]
            if not file_path.exists():
                raise HTTPException(status_code=404, detail="Document file not found")
            return {
                "slug": slug,
                "title": doc["title"],
                "version": doc["version"],
                "content": file_path.read_text(encoding="utf-8"),
                "effective_date": manifest.get("effective_date"),
            }
    raise HTTPException(status_code=404, detail="Document not found")


def _log_consent(
    db: Session,
    *,
    user_id,
    consent_type: str,
    version: str,
    request: Request | None = None,
) -> None:
    ip = None
    ua = None
    if request:
        ip = request.client.host if request.client else None
        ua = (request.headers.get("user-agent") or "")[:512] or None
    db.add(
        UserConsentLog(
            user_id=user_id,
            consent_type=consent_type,
            version=version,
            ip_address=ip,
            user_agent=ua,
        )
    )


def record_consent(
    db: Session,
    user: User,
    consent_type: str,
    version: str | None,
    *,
    request: Request | None = None,
) -> None:
    required = get_required_versions()
    if consent_type in ("terms", "privacy", "ai_notice", "payment"):
        expected = required.get(consent_type.replace("payment", "payment"))
        if consent_type == "payment":
            expected = get_current_versions().get("payment-terms")
        elif consent_type in required:
            expected = required[consent_type]
        else:
            expected = version
        if expected and version and version != expected:
            raise HTTPException(status_code=400, detail=f"Outdated {consent_type} version")

    now = datetime.utcnow()
    if consent_type == "terms":
        user.terms_accepted_at = now
        user.terms_version = version or required.get("terms")
    elif consent_type == "privacy":
        user.privacy_accepted_at = now
        user.privacy_version = version or required.get("privacy")
    elif consent_type == "ai_notice":
        user.ai_notice_accepted_at = now
    elif consent_type == "wechat_privacy":
        user.wechat_privacy_authorized_at = now
    elif consent_type == "analytics":
        user.analytics_consent = True
    else:
        raise HTTPException(status_code=400, detail="Unknown consent type")

    _log_consent(
        db,
        user_id=user.id,
        consent_type=consent_type,
        version=version or required.get(consent_type, "unknown"),
        request=request,
    )


def revoke_analytics_consent(db: Session, user: User, *, request: Request | None = None) -> None:
    user.analytics_consent = False
    _log_consent(db, user_id=user.id, consent_type="analytics_revoked", version="n/a", request=request)


def consent_status(user: User | None) -> dict:
    required = get_required_versions()
    missing: list[str] = []
    if not user:
        return {"missing": ["privacy"], "required_versions": required, "analytics_consent": False}

    if not user.privacy_accepted_at or user.privacy_version != required.get("privacy"):
        missing.append("privacy")
    if not user.terms_accepted_at or user.terms_version != required.get("terms"):
        missing.append("terms")
    if not user.ai_notice_accepted_at:
        missing.append("ai_notice")

    return {
        "missing": missing,
        "required_versions": required,
        "terms_version": user.terms_version,
        "privacy_version": user.privacy_version,
        "analytics_consent": bool(user.analytics_consent),
        "ai_notice_accepted": bool(user.ai_notice_accepted_at),
        "deletion_scheduled_at": user.deletion_scheduled_at.isoformat() if user.deletion_scheduled_at else None,
    }


def require_ai_notice(user: User) -> None:
    if user.deleted_at or user.deletion_scheduled_at:
        raise HTTPException(status_code=403, detail="Account is pending deletion")
    if not user.ai_notice_accepted_at:
        raise HTTPException(status_code=403, detail="AI notice consent required")


def require_payment_terms(version: str | None) -> str:
    expected = get_current_versions().get("payment-terms")
    if not expected:
        return version or ""
    if not version or version != expected:
        raise HTTPException(status_code=400, detail="Must accept current payment terms")
    return expected


def record_payment_terms_consent(
    db: Session,
    user: User,
    version: str,
    *,
    request: Request | None = None,
) -> None:
    """Audit trail for payment terms acceptance at checkout."""
    _log_consent(
        db,
        user_id=user.id,
        consent_type="payment_terms",
        version=version,
        request=request,
    )


def require_registration_consents(terms_version: str | None, privacy_version: str | None) -> None:
    required = get_required_versions()
    if not terms_version or terms_version != required.get("terms"):
        raise HTTPException(status_code=400, detail="Must accept current terms of service")
    if not privacy_version or privacy_version != required.get("privacy"):
        raise HTTPException(status_code=400, detail="Must accept current privacy policy")


def apply_registration_consents(
    db: Session,
    user: User,
    terms_version: str,
    privacy_version: str,
    *,
    request: Request | None = None,
) -> None:
    require_registration_consents(terms_version, privacy_version)
    now = datetime.utcnow()
    user.terms_accepted_at = now
    user.terms_version = terms_version
    user.privacy_accepted_at = now
    user.privacy_version = privacy_version
    _log_consent(db, user_id=user.id, consent_type="terms", version=terms_version, request=request)
    _log_consent(db, user_id=user.id, consent_type="privacy", version=privacy_version, request=request)
