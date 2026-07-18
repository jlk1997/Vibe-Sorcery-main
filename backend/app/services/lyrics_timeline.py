"""Parse LRC and plain lyrics into playback timelines."""

from __future__ import annotations

import re
from typing import Any

_LRC_TAG = re.compile(r"\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]")
_META_TAG = re.compile(r"^\[(ti|ar|al|by|offset):", re.I)


def parse_lrc_timeline(text: str) -> list[dict[str, Any]]:
    """Parse standard LRC `[mm:ss.xx]lyric` lines into sorted timeline entries."""
    entries: list[dict[str, Any]] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line or _META_TAG.match(line):
            continue
        matches = list(_LRC_TAG.finditer(line))
        if not matches:
            continue
        lyric = _LRC_TAG.sub("", line).strip()
        if not lyric:
            continue
        for match in matches:
            minutes = int(match.group(1))
            seconds = int(match.group(2))
            frac = match.group(3)
            frac_seconds = 0.0
            if frac:
                frac_seconds = int(frac) / (10 ** len(frac))
            entries.append({"time": minutes * 60 + seconds + frac_seconds, "text": lyric})
    entries.sort(key=lambda item: item["time"])
    return entries


def timeline_from_plain_lyrics(lyrics: str, duration: float) -> list[dict[str, Any]]:
    """Evenly distribute non-LRC lyric lines across track duration."""
    lines = [ln.strip() for ln in lyrics.split("\n") if ln.strip() and not ln.strip().startswith("[")]
    if not lines:
        return []
    total = max(float(duration or 0), len(lines) * 3.0, 30.0)
    step = total / max(len(lines), 1)
    return [{"time": i * step, "text": line} for i, line in enumerate(lines)]


def build_lyrics_timeline(
    lyrics: str | None,
    *,
    duration: float | None = None,
    embedded_timeline: list | None = None,
) -> tuple[str | None, list[dict[str, Any]] | None]:
    """Return display lyrics and timeline, preferring LRC then embedded then synthetic."""
    if embedded_timeline:
        cleaned = [
            {"time": float(item.get("time", 0)), "text": str(item.get("text", "")).strip()}
            for item in embedded_timeline
            if isinstance(item, dict) and str(item.get("text", "")).strip()
        ]
        if cleaned:
            cleaned.sort(key=lambda item: item["time"])
            plain = lyrics or "\n".join(item["text"] for item in cleaned)
            return plain, cleaned

    if not lyrics:
        return None, None

    lrc = parse_lrc_timeline(lyrics)
    if lrc:
        plain = "\n".join(item["text"] for item in lrc)
        return plain, lrc

    plain_lines = [ln.strip() for ln in lyrics.split("\n") if ln.strip() and not ln.strip().startswith("[")]
    if not plain_lines:
        return lyrics, None
    timeline = timeline_from_plain_lyrics("\n".join(plain_lines), float(duration or len(plain_lines) * 4))
    return "\n".join(plain_lines), timeline
