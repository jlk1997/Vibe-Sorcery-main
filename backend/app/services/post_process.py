import json
import logging
import uuid

from sqlalchemy.orm import Session

from app.config import settings
from app.models.schemas import FeatureFlag, GenerationJob, ProvenanceRecord, Work
from app.services.c2pa import anchor_to_blockchain, build_c2pa_manifest, embed_c2pa_binary
from app.services.job_progress import update_job_phase
from app.services.media import generate_waveform_preview, transcode_to_hls
from app.services.provenance import build_lineage
from app.services.storage import get_storage_service
from app.integrations.minimax.image import image_client

logger = logging.getLogger(__name__)


def _flag_enabled(db: Session, key: str, default: bool = True) -> bool:
    flag = db.query(FeatureFlag).filter(FeatureFlag.key == key).first()
    return flag.enabled if flag else default


def _merge_post_process_status(work: Work, **flags: bool | str) -> None:
    pps = dict(work.post_process_status or {})
    pps.update({k: v for k, v in flags.items() if v is not None})
    work.post_process_status = pps


def _touch_job(
    db: Session,
    job_id: uuid.UUID | None,
    *,
    progress: float,
    status_message: str,
    phase: str,
) -> GenerationJob | None:
    if not job_id:
        return None
    job = db.query(GenerationJob).filter(GenerationJob.id == job_id).first()
    if not job or job.status in ("completed", "failed", "cancelled"):
        return None
    if job.status not in ("running", "pending", "audio_ready", "post_processing"):
        return None
    update_job_phase(db, job, progress=progress, status_message=status_message, phase=phase)
    return job


async def post_process_work(
    db: Session,
    work_id: uuid.UUID,
    audio_bytes: bytes,
    job_id: uuid.UUID | None = None,
) -> dict:
    """Phase 3 post-processing: HLS, waveform, cover, C2PA, blockchain anchor."""
    work = db.query(Work).filter(Work.id == work_id).first()
    if not work:
        return {"error": "work not found"}

    results: dict = {}
    job = _touch_job(db, job_id, progress=0.91, status_message="正在封装流媒体…", phase="hls")

    if _flag_enabled(db, "hls_streaming"):
        hls = transcode_to_hls(audio_bytes, str(work_id))
        if hls.get("hls_url"):
            work.hls_url = hls["hls_url"]
            work.hls_storage_prefix = hls.get("prefix")
            _merge_post_process_status(work, hls_done=True)
        results["hls"] = hls
    else:
        results["hls"] = {"status": "disabled"}

    _touch_job(db, job_id, progress=0.93, status_message="正在绘制声波纹…", phase="waveform")
    waveform = generate_waveform_preview(audio_bytes)
    if waveform:
        key = f"covers/waveform/{work_id}.png"
        _, url = get_storage_service().upload_bytes(waveform, key, "image/png")
        results["waveform_url"] = url
        _merge_post_process_status(work, waveform_done=True)

    _touch_job(db, job_id, progress=0.95, status_message="正在炼制封面…", phase="cover")
    if _flag_enabled(db, "music_cover", default=False):
        cover_prompt = (
            f"Album cover art, {', '.join((work.moods or [])[:3])}, "
            f"{', '.join((work.genres or [])[:2])}, abstract emotional, cinematic"
        )
        try:
            cover_result = await image_client.generate_cover_image(
                prompt=cover_prompt,
                user_id=str(work.owner_id),
                db=db,
            )
            if cover_result.get("image_bytes"):
                key = get_storage_service().generate_work_key(str(work.owner_id), "png").replace("works/", "covers/")
                storage_key, cover_url = get_storage_service().upload_bytes(
                    cover_result["image_bytes"], key, "image/png"
                )
                work.cover_url = cover_url
                work.cover_storage_key = storage_key
                _merge_post_process_status(work, cover_done=True)
            results["cover"] = {"prompt": cover_prompt, "generated": bool(cover_result.get("image_bytes"))}
        except Exception as exc:
            logger.warning("AI cover skipped for work %s: %s", work_id, exc)
            results["cover"] = {"prompt": cover_prompt, "generated": False, "skipped": str(exc)}

    _touch_job(db, job_id, progress=0.98, status_message="正在封印溯源谱系…", phase="provenance")
    if _flag_enabled(db, "c2pa_provenance") and settings.c2pa_enabled:
        prov = db.query(ProvenanceRecord).filter(ProvenanceRecord.work_id == work_id).first()
        if not prov:
            prov = ProvenanceRecord(
                work_id=work_id,
                pipeline_version=settings.pipeline_version,
                step_index=0,
                record_type="generated",
                output_meta={"sha256": work.content_hash},
            )
            db.add(prov)
            db.flush()
        lineage = build_lineage(db, work_id)
        manifest = build_c2pa_manifest(
            str(work_id),
            work.content_hash or "",
            lineage,
            prov.signature if prov else None,
        )
        embedded_bytes, package_info = embed_c2pa_binary(audio_bytes, manifest)
        sidecar_key = f"provenance/{work_id}/c2pa.json"
        if prov:
            prov.c2pa_manifest = manifest
            get_storage_service().upload_bytes(
                json.dumps(manifest, indent=2).encode(),
                sidecar_key,
                "application/json",
            )
            if package_info.get("embedded") and work.storage_key:
                # Never overwrite the stored track with a payload smaller than the
                # source audio: embedding ID3 tags can only grow (or equal) the file,
                # so a shrink means the embed dropped audio frames. Overwriting with
                # such a stub would produce a silent, undecodable track.
                if len(embedded_bytes) < len(audio_bytes):
                    logger.error(
                        "C2PA embed shrank audio for %s (%d < %d) — skipping re-upload to protect the track",
                        work_id,
                        len(embedded_bytes),
                        len(audio_bytes),
                    )
                    package_info["audio_reuploaded"] = False
                else:
                    try:
                        get_storage_service().upload_bytes(
                            embedded_bytes,
                            work.storage_key,
                            "audio/mpeg",
                        )
                        package_info["audio_reuploaded"] = True
                    except Exception as exc:
                        logger.warning("C2PA audio re-upload failed for %s: %s", work_id, exc)
                        package_info["audio_reuploaded"] = False
            if settings.blockchain_anchor_enabled:
                anchor = anchor_to_blockchain(work.content_hash or "", str(work_id))
                if anchor:
                    prov.blockchain_tx_hash = anchor.get("tx_hash")
                    results["blockchain"] = anchor
            _merge_post_process_status(
                work,
                c2pa_done=True,
                c2pa=True,
                c2pa_sidecar_key=sidecar_key,
                c2pa_embedded=bool(package_info.get("embedded")),
            )
        results["c2pa"] = package_info

    db.commit()
    _finalize_post_process_state(db, work, results)
    db.commit()
    return results


def _finalize_post_process_state(db: Session, work: Work, results: dict) -> None:
    hls_expected = _flag_enabled(db, "hls_streaming")
    cover_expected = _flag_enabled(db, "music_cover", default=False)
    degraded = False
    if hls_expected and not work.hls_url:
        degraded = True
    if cover_expected and not work.cover_url and not results.get("cover", {}).get("generated"):
        degraded = True
    if results.get("error"):
        degraded = True
    _merge_post_process_status(work, state="degraded" if degraded else "ready")
