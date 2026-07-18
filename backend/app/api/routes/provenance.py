import hashlib
import json
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse, Response
from sqlalchemy.orm import Session

from app.api.deps import get_optional_user
from app.api.schemas import ProvenanceResponse
from app.config import settings
from app.database import get_db
from app.models.schemas import ProvenanceRecord, User, Work
from app.services.provenance import build_lineage
from app.services.storage import get_storage_service
from app.services.work_access import can_view_work, parse_uuid

router = APIRouter(prefix="/provenance", tags=["provenance"])


def _assert_work_visible(work: Work, user: User | None) -> None:
    if not can_view_work(work, user):
        raise HTTPException(status_code=403, detail="Forbidden")


def _get_work(db: Session, work_id: str) -> Work:
    work = db.query(Work).filter(Work.id == parse_uuid(work_id, field="work_id")).first()
    if not work:
        raise HTTPException(status_code=404, detail="Work not found")
    return work


@router.get("/{work_id}", response_model=ProvenanceResponse)
def get_provenance(
    work_id: str,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    work = _get_work(db, work_id)
    _assert_work_visible(work, user)

    lineage = build_lineage(db, work.id)
    return ProvenanceResponse(
        work_id=work_id,
        lineage=lineage,
        pipeline_version=settings.pipeline_version,
        verification_url=f"/provenance/{work_id}",
    )


@router.get("/{work_id}/lineage")
def get_lineage(
    work_id: str,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    work = _get_work(db, work_id)
    _assert_work_visible(work, user)
    return {"lineage": build_lineage(db, work.id)}


@router.get("/{work_id}/verify")
def verify_provenance(
    work_id: str,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    work = _get_work(db, work_id)
    _assert_work_visible(work, user)

    prov = db.query(ProvenanceRecord).filter(ProvenanceRecord.work_id == work.id).first()
    if not prov:
        raise HTTPException(status_code=404, detail="Provenance not found")

    stored_hash = (prov.output_meta or {}).get("sha256") or work.content_hash
    verified = False
    computed_hash = None
    if stored_hash:
        try:
            url = work.audio_url
            if work.storage_key:
                url = get_storage_service().get_presigned_url(work.storage_key)
            resp = httpx.get(url, timeout=60)
            resp.raise_for_status()
            computed_hash = hashlib.sha256(resp.content).hexdigest()
            verified = computed_hash == stored_hash
        except Exception:
            verified = False

    return {
        "work_id": work_id,
        "verified": verified,
        "content_hash": stored_hash,
        "computed_hash": computed_hash,
        "signature": prov.signature,
        "pipeline_version": prov.pipeline_version,
        "c2pa_manifest": prov.c2pa_manifest,
        "blockchain_tx_hash": prov.blockchain_tx_hash,
    }


@router.get("/{work_id}/export")
def export_provenance(
    work_id: str,
    format: str = "json",
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    work = _get_work(db, work_id)
    _assert_work_visible(work, user)

    lineage = build_lineage(db, work.id)
    payload = {
        "@context": "https://schema.org/",
        "@type": "CreativeWork",
        "work_id": work_id,
        "pipeline_version": settings.pipeline_version,
        "lineage": lineage,
    }

    if format == "vibe":
        content = json.dumps(payload, indent=2, ensure_ascii=False)
        return Response(
            content=content,
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{work_id}.vibe"'},
        )
    return JSONResponse(payload)
