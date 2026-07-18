"""Heuristic work quality scores for post-generation UX."""

from __future__ import annotations

from typing import Any

from app.models.schemas import ProvenanceRecord, Work


def compute_work_quality(work: Work, prov: ProvenanceRecord | None = None) -> dict[str, Any]:
    moods = work.moods or []
    genres = work.genres or []
    pps = work.post_process_status or {}

    resonance = 72
    resonance += min(12, len(moods) * 3)
    resonance += min(6, len(genres) * 2)
    if work.cover_url:
        resonance += 4
    if work.arousal is not None and work.valence is not None:
        resonance += 3
    resonance = min(96, resonance)

    completion = 70
    if work.duration and work.duration >= 45:
        completion += 8
    elif work.duration:
        completion += 4
    if work.audio_url:
        completion += 6
    if pps.get("c2pa_done") or pps.get("c2pa") or work.cover_url:
        completion += 5
    if prov and (prov.music_request or prov.m3_request):
        completion += 4
    completion = min(96, completion)

    if resonance < 80:
        suggestion_key = "mood"
    elif completion < 80:
        suggestion_key = "structure"
    else:
        suggestion_key = "publish"

    return {
        "resonance": resonance,
        "completion": completion,
        "suggestion_key": suggestion_key,
    }
