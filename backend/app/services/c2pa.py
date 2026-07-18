import hashlib
import json
import logging
from datetime import datetime, timezone
from io import BytesIO
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)


def build_c2pa_manifest(
    work_id: str,
    content_hash: str,
    provenance_chain: list[dict],
    signature: str | None = None,
) -> dict:
    """Build C2PA-style manifest JSON for audio provenance."""
    return {
        "claim_generator": "Vibe Sorcery",
        "claim_generator_info": [{"name": "Vibe Sorcery", "version": settings.pipeline_version}],
        "title": f"work:{work_id}",
        "format": "audio/mpeg",
        "instance_id": work_id,
        "assertions": [
            {
                "label": "c2pa.actions",
                "data": {
                    "actions": [
                        {
                            "action": "c2pa.created",
                            "softwareAgent": "Vibe Sorcery Platform",
                            "when": datetime.now(timezone.utc).isoformat(),
                        }
                    ]
                },
            },
            {
                "label": "vibe.provenance",
                "data": {
                    "content_hash": content_hash,
                    "lineage_depth": len(provenance_chain),
                    "pipeline_version": settings.pipeline_version,
                    "signature": signature,
                },
            },
        ],
        "hash": content_hash,
    }


def embed_c2pa_sidecar(audio_bytes: bytes, manifest: dict) -> tuple[bytes, dict]:
    """Fallback: manifest stored as sidecar only."""
    sidecar = json.dumps(manifest, separators=(",", ":")).encode("utf-8")
    package_info = {
        "embedded": False,
        "sidecar_size": len(sidecar),
        "manifest_hash": hashlib.sha256(sidecar).hexdigest(),
        "method": "sidecar",
    }
    return audio_bytes, package_info


def embed_c2pa_binary(audio_bytes: bytes, manifest: dict) -> tuple[bytes, dict]:
    """
    Embed C2PA manifest hash (and compact manifest when small) into MP3 ID3 tags.
    Falls back to sidecar metadata when mutagen is unavailable or format unsupported.
    """
    manifest_json = json.dumps(manifest, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    manifest_hash = hashlib.sha256(manifest_json).hexdigest()

    try:
        from mutagen.id3 import ID3, TXXX, ID3NoHeaderError
        from mutagen.mp3 import MP3
    except ImportError:
        logger.debug("mutagen not installed — C2PA sidecar only")
        info = embed_c2pa_sidecar(audio_bytes, manifest)[1]
        info["manifest_hash"] = manifest_hash
        return audio_bytes, info

    buf = BytesIO(audio_bytes)
    try:
        try:
            audio = MP3(buf, ID3=ID3)
        except ID3NoHeaderError:
            audio = MP3(buf)
            audio.add_tags()

        if audio.tags is None:
            audio.add_tags()

        audio.tags.delall("TXXX")
        audio.tags.add(TXXX(encoding=3, desc="VibeSorceryC2PA", text=manifest_hash))
        if len(manifest_json) <= 7500:
            audio.tags.add(
                TXXX(encoding=3, desc="VibeSorceryManifest", text=manifest_json.decode("utf-8"))
            )

        out = BytesIO()
        audio.save(out)
        return out.getvalue(), {
            "embedded": True,
            "method": "id3_txxx",
            "manifest_hash": manifest_hash,
        }
    except Exception as exc:
        logger.warning("ID3 C2PA embed failed, using sidecar: %s", exc)
        info = embed_c2pa_sidecar(audio_bytes, manifest)[1]
        info["manifest_hash"] = manifest_hash
        info["embed_error"] = str(exc)[:200]
        return audio_bytes, info


def anchor_to_blockchain(content_hash: str, work_id: str) -> dict | None:
    """Optional blockchain anchoring stub — stores hash reference when enabled."""
    if not settings.blockchain_anchor_enabled:
        return None
    anchor_record = {
        "work_id": work_id,
        "content_hash": content_hash,
        "chain": "polygon",
        "rpc": settings.blockchain_rpc_url or "mock",
        "tx_hash": f"0x{hashlib.sha256(f'{work_id}:{content_hash}'.encode()).hexdigest()[:64]}",
        "anchored_at": datetime.now(timezone.utc).isoformat(),
        "status": "mock_anchored" if not settings.blockchain_rpc_url else "pending",
    }
    return anchor_record
