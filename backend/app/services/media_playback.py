"""Short-lived playback tickets and gateway URLs — never expose long-lived storage URLs to clients."""

from __future__ import annotations

import json
import re
import secrets
import uuid
from typing import TYPE_CHECKING
from urllib.parse import urlencode

from fastapi import HTTPException

from app.config import settings
from app.services.work_access import can_view_work

if TYPE_CHECKING:
    from app.models.schemas import User, Work

_TICKET_PREFIX = "media:ticket:"
_PRESIGNED_HOST_MARKERS = ("X-Amz-Signature", "X-Amz-Algorithm", "AWSAccessKeyId", "Signature=")
_local_tickets: dict[str, tuple[float, str]] = {}


def _redis_client():
    import redis

    return redis.from_url(settings.redis_url, decode_responses=True)


def _redis_available() -> bool:
    try:
        _redis_client().ping()
        return True
    except Exception:
        return False


def _local_set(key: str, value: str, ttl: int) -> None:
    import time

    _local_tickets[key] = (time.monotonic() + ttl, value)


def _local_get(key: str) -> str | None:
    import time

    row = _local_tickets.get(key)
    if not row:
        return None
    expires, value = row
    if time.monotonic() >= expires:
        _local_tickets.pop(key, None)
        return None
    return value


def issue_playback_ticket(work_id: str, user_id: uuid.UUID | None) -> str:
    ttl = settings.media_playback_ticket_ttl_seconds
    ticket = secrets.token_urlsafe(32)
    payload = json.dumps({"work_id": work_id, "user_id": str(user_id) if user_id else None})
    key = f"{_TICKET_PREFIX}{ticket}"
    if _redis_available():
        _redis_client().setex(key, ttl, payload)
    else:
        _local_set(key, payload, ttl)
    return ticket


def consume_playback_ticket(ticket: str, *, work_id: str) -> dict | None:
    if not ticket:
        return None
    key = f"{_TICKET_PREFIX}{ticket}"
    raw = None
    if _redis_available():
        try:
            raw = _redis_client().get(key)
        except Exception:
            raw = None
    else:
        raw = _local_get(key)
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if str(data.get("work_id")) != str(work_id):
        return None
    return data


def validate_playback_access(
    db,
    work: Work,
    *,
    ticket: str | None,
    user: User | None,
) -> None:
    """Raise HTTPException if caller may not stream this work.

    Media requests (mini-program InnerAudioContext, <audio>/<img> tags) cannot
    attach an Authorization header, so a valid short-lived ticket is the only
    credential they can present. Tickets are minted exclusively for viewers who
    were already authorized at issue time and are bound to this work id, so a
    valid, unexpired ticket is sufficient on its own — we must NOT additionally
    require the media request to be authenticated.
    """
    if user is not None and can_view_work(work, user):
        return
    if ticket:
        data = consume_playback_ticket(ticket, work_id=str(work.id))
        if not data:
            raise HTTPException(status_code=403, detail="Playback ticket invalid or expired")
        return
    raise HTTPException(status_code=401, detail="Authentication or playback ticket required")


def _api_base() -> str:
    return settings.api_public_url.rstrip("/")


def _user_id(user: User | uuid.UUID | None) -> uuid.UUID | None:
    if user is None:
        return None
    return user.id if hasattr(user, "id") else user


def protected_stream_url(work: Work, user: User | uuid.UUID | None = None) -> str:
    """Gateway MP3 stream URL with short-lived ticket (no raw S3 presign)."""
    ticket = issue_playback_ticket(str(work.id), _user_id(user))
    qs = urlencode({"ticket": ticket})
    return f"{_api_base()}/works/{work.id}/stream?{qs}"


def protected_hls_playlist_url(work: Work, user: User | uuid.UUID | None = None) -> str | None:
    from app.services.hls import hls_prefix_from_work

    prefix = hls_prefix_from_work(
        hls_storage_prefix=work.hls_storage_prefix,
        hls_url=work.hls_url,
    )
    if not prefix:
        return work.hls_url if work.hls_url and not _looks_like_storage_url(work.hls_url) else None
    ticket = issue_playback_ticket(str(work.id), _user_id(user))
    qs = urlencode({"ticket": ticket})
    return f"{_api_base()}/works/{work.id}/hls/playlist.m3u8?{qs}"


def _looks_like_storage_url(url: str) -> bool:
    if not url:
        return False
    return any(marker in url for marker in _PRESIGNED_HOST_MARKERS) or "/works/" in url and ".mp3" in url


def resolve_protected_audio_url(work: Work, user: User | uuid.UUID | None = None) -> str:
    if work.storage_key or (work.audio_url and _looks_like_storage_url(work.audio_url)):
        return protected_stream_url(work, user)
    if work.audio_url:
        return protected_stream_url(work, user)
    return ""


def resolve_protected_hls_url(work: Work, user: User | uuid.UUID | None = None) -> str | None:
    return protected_hls_playlist_url(work, user)


def rewrite_hls_playlist_for_gateway(m3u8_text: str, *, work_id: str, ticket: str) -> str:
    """Replace segment lines with same-origin proxied URLs (ticket required per segment)."""
    from app.services.hls import _SEGMENT_LINE

    base = _api_base()
    out: list[str] = []
    for line in m3u8_text.splitlines():
        stripped = line.strip()
        if stripped and _SEGMENT_LINE.match(stripped):
            seg_name = stripped.split("/")[-1]
            qs = urlencode({"ticket": ticket})
            out.append(f"{base}/works/{work_id}/hls/segments/{seg_name}?{qs}")
        else:
            out.append(line)
    if m3u8_text.endswith("\n"):
        out.append("")
    return "\n".join(out)


def work_audio_storage_key(work: Work) -> str | None:
    if work.storage_key:
        return work.storage_key
    url = work.audio_url or ""
    if not url or not _looks_like_storage_url(url):
        return None
    from urllib.parse import unquote, urlparse

    parsed = urlparse(url)
    path = unquote(parsed.path).lstrip("/")
    parts = path.split("/", 1)
    if len(parts) == 2 and parts[0] == settings.s3_bucket:
        return parts[1]
    if path.startswith("works/"):
        return path
    return None


def is_safe_segment_name(name: str) -> bool:
    return bool(re.fullmatch(r"seg_\d+\.ts", name, flags=re.IGNORECASE))
