import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

PIPELINE_VERSION = "vibe-sorcery/2.0.0"


def compute_file_hash(file_path: str) -> str:
    sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha256.update(chunk)
    return sha256.hexdigest()


def build_emotion_snapshot(
    moods: List[str],
    genres: List[str],
    arousal: Optional[float] = None,
    valence: Optional[float] = None,
) -> Dict[str, Any]:
    snapshot: Dict[str, Any] = {"moods": moods, "genres": genres}
    if arousal is not None:
        snapshot["arousal"] = arousal
    if valence is not None:
        snapshot["valence"] = valence
    return snapshot


def build_provenance_record(
    step: int,
    record_type: str,
    emotion_snapshot: Dict[str, Any],
    caption: str,
    generation_result: Optional[Any] = None,
    parent_file_path: Optional[str] = None,
    duration: Optional[float] = None,
    seed: Optional[int] = None,
) -> Dict[str, Any]:
    record: Dict[str, Any] = {
        "step": step,
        "type": record_type,
        "pipeline_version": PIPELINE_VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "emotion_snapshot": emotion_snapshot,
        "caption": caption,
        "parent_file_path": parent_file_path,
    }

    if generation_result is not None:
        record.update(generation_result.to_provenance_dict())
        record["output"]["sha256"] = compute_file_hash(generation_result.file_path)
    elif duration is not None:
        record["output"] = {"duration": duration}
        if seed is not None:
            record["music_request"] = {"seed": seed}

    return record


def export_provenance_json(records: List[Dict[str, Any]], output_path: str) -> str:
    payload = {
        "pipeline_version": PIPELINE_VERSION,
        "lineage": records,
    }
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return str(path)
