"""Reference track — inherit AV/moods/genres from an existing work with optional offset."""

from __future__ import annotations

import uuid
from copy import deepcopy

from sqlalchemy.orm import Session

from app.models.schemas import Work


def apply_reference_emotion(
    db: Session,
    base: dict,
    reference_work_id: str | uuid.UUID | None,
    *,
    av_offset: dict | None = None,
) -> tuple[dict, uuid.UUID | None]:
    """Merge reference work emotion profile into base dict. Returns (base, ref_uuid)."""
    if not reference_work_id:
        return base, None

    try:
        ref_uuid = uuid.UUID(str(reference_work_id))
    except ValueError:
        return base, None

    ref_work = db.query(Work).filter(Work.id == ref_uuid).first()
    if not ref_work:
        return base, None

    out = deepcopy(base)
    if ref_work.arousal is not None:
        out["arousal"] = ref_work.arousal
    if ref_work.valence is not None:
        out["valence"] = ref_work.valence
    if ref_work.moods:
        out["moods"] = list(ref_work.moods)
    if ref_work.genres:
        out["genres"] = list(ref_work.genres)

    offset = av_offset or {}
    if offset.get("arousal") is not None and out.get("arousal") is not None:
        out["arousal"] = max(1, min(9, float(out["arousal"]) + float(offset["arousal"])))
    if offset.get("valence") is not None and out.get("valence") is not None:
        out["valence"] = max(1, min(9, float(out["valence"]) + float(offset["valence"])))

    return out, ref_uuid


def resolve_reference_config(journey_config: dict, anchor_context: dict | None = None) -> dict | None:
    """Pick reference block from journey config or anchor context."""
    ref = journey_config.get("reference")
    if ref and ref.get("work_id"):
        return ref
    ctx = anchor_context or {}
    if ctx.get("reference_work_id"):
        return {
            "work_id": ctx["reference_work_id"],
            "av_offset": ref.get("av_offset") if ref else None,
        }
    return None
