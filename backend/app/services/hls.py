"""HLS playlist helpers — sign segment URLs for private object storage."""

from __future__ import annotations

import re
from urllib.parse import unquote, urlparse

from app.services.storage import StorageService, get_storage_service

_SEGMENT_LINE = re.compile(r"^[^\#].+\.ts$", re.IGNORECASE)


def hls_prefix_from_work(*, hls_storage_prefix: str | None, hls_url: str | None) -> str | None:
    if hls_storage_prefix:
        return hls_storage_prefix.rstrip("/")
    if not hls_url:
        return None
    parsed = urlparse(hls_url)
    path = unquote(parsed.path).lstrip("/")
    parts = path.split("/", 1)
    if len(parts) == 2:
        path = parts[1]
    if not path.endswith("index.m3u8"):
        return None
    return path[: -len("/index.m3u8")]


def rewrite_hls_playlist(m3u8_text: str, prefix: str, storage: StorageService | None = None, *, expires: int = 86400) -> str:
    """Replace relative .ts segment names with presigned object URLs."""
    storage = storage or get_storage_service()
    prefix = prefix.rstrip("/")
    out: list[str] = []
    for line in m3u8_text.splitlines():
        stripped = line.strip()
        if stripped and _SEGMENT_LINE.match(stripped):
            seg_name = stripped.split("/")[-1]
            seg_key = f"{prefix}/{seg_name}"
            out.append(storage.get_presigned_url(seg_key, expires=expires))
        else:
            out.append(line)
    if m3u8_text.endswith("\n"):
        out.append("")
    return "\n".join(out)


def build_hls_playlist(prefix: str, storage: StorageService | None = None, *, expires: int = 86400) -> str:
    storage = storage or get_storage_service()
    key = f"{prefix.rstrip('/')}/index.m3u8"
    body = storage.get_object_bytes(key)
    return rewrite_hls_playlist(body.decode("utf-8"), prefix, storage, expires=expires)
