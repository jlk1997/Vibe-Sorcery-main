import uuid

from sqlalchemy.orm import Session

from app.models.schemas import ProvenanceRecord, Work


def build_lineage(db: Session, work_id: uuid.UUID) -> list[dict]:
    lineage = []
    current_id = work_id
    visited = set()

    while current_id and current_id not in visited:
        visited.add(current_id)
        work = db.query(Work).filter(Work.id == current_id).first()
        if not work:
            break
        prov = db.query(ProvenanceRecord).filter(
            ProvenanceRecord.work_id == current_id
        ).first()

        entry = {
            "step": work.step_index or 0,
            "work_id": str(work.id),
            "type": prov.record_type if prov else "unknown",
            "title": work.title,
            "emotion": {
                "moods": work.moods or [],
                "genres": work.genres or [],
                "arousal": work.arousal,
                "valence": work.valence,
            },
            "parent_work_id": str(work.parent_work_id) if work.parent_work_id else None,
        }
        if prov:
            entry["m3_request"] = prov.m3_request
            entry["music_request"] = prov.music_request
            entry["output"] = prov.output_meta
            entry["signature"] = prov.signature
            entry["pipeline_version"] = prov.pipeline_version

        lineage.append(entry)
        current_id = work.parent_work_id

    lineage.reverse()
    for i, item in enumerate(lineage):
        item["step"] = i
    return lineage
