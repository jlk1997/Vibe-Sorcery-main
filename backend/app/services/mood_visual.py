"""Mood visual slideshow manifest for in-app preview and MP4 export."""

from __future__ import annotations

from typing import Any

import httpx
from sqlalchemy.orm import Session

from app.models.schemas import Work
from app.services.storage import get_storage_service


def build_mood_visual_slides(db: Session, work: Work) -> list[dict[str, Any]]:
    from app.api.routes.works import _extract_lyrics

    lyrics, timeline = _extract_lyrics(db, work)
    slides: list[dict[str, Any]] = []
    if work.cover_url:
        slides.append({"type": "cover", "image_url": work.cover_url, "duration_sec": 4, "caption": work.title})
    if work.moods:
        slides.append({"type": "moods", "text": " · ".join(work.moods[:4]), "duration_sec": 3})
    if timeline:
        for item in timeline[:12]:
            slides.append(
                {
                    "type": "lyric",
                    "text": item["text"],
                    "at_sec": item["time"],
                    "duration_sec": 3,
                }
            )
    elif lyrics:
        for line in lyrics.split("\n")[:6]:
            if line.strip():
                slides.append({"type": "lyric", "text": line.strip(), "duration_sec": 3})
    if work.arousal is not None or work.valence is not None:
        slides.append(
            {
                "type": "emotion",
                "arousal": work.arousal,
                "valence": work.valence,
                "duration_sec": 3,
            }
        )
    return slides


def build_mood_visual_manifest(db: Session, work: Work) -> dict[str, Any]:
    slides = build_mood_visual_slides(db, work)
    audio_url = work.audio_url
    if work.storage_key:
        try:
            audio_url = get_storage_service().get_presigned_url(work.storage_key)
        except Exception:
            pass
    return {
        "work_id": str(work.id),
        "title": work.title,
        "audio_url": audio_url,
        "cover_url": work.cover_url,
        "slides": slides,
        "total_duration_sec": sum(s.get("duration_sec", 3) for s in slides),
    }


def fetch_work_audio_bytes(work: Work) -> bytes | None:
    storage = get_storage_service()
    if work.storage_key:
        try:
            return storage.get_object_bytes(work.storage_key)
        except Exception:
            pass
    url = work.audio_url
    if work.storage_key:
        try:
            url = storage.get_presigned_url(work.storage_key)
        except Exception:
            pass
    try:
        resp = httpx.get(url, timeout=60)
        resp.raise_for_status()
        return resp.content
    except Exception:
        return None
