"""MiniMax /music_generation — stream + non-stream with official fallback."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

import httpx

from app.config import settings
from app.integrations.minimax.http_utils import (
    get_music_client,
    minimax_request_slot,
    minimax_timeout,
    post_json_with_retry,
)
from app.integrations.minimax.music_response import (
    apply_music_request_format,
    is_retryable_minimax_error,
    minimax_status_error,
    parse_music_sse_text,
    resolve_music_audio_bytes,
    validate_music_response,
)

logger = logging.getLogger(__name__)

STREAM_ATTEMPTS = 3


async def _read_music_sse_response(
    url: str,
    *,
    headers: dict[str, str],
    payload: dict[str, Any],
    timeout: httpx.Timeout,
) -> str:
    """Read MiniMax music SSE line-by-line (fail fast on base_resp errors)."""
    async with minimax_request_slot():
        client = get_music_client()
        async with client.stream("POST", url, headers=headers, json=payload, timeout=timeout) as resp:
            resp.raise_for_status()
            content_type = (resp.headers.get("content-type") or "").lower()

            if "application/json" in content_type:
                raw = (await resp.aread()).decode("utf-8", errors="replace")
                return raw.strip()

            lines: list[str] = []
            async for line in resp.aiter_lines():
                if line is None:
                    continue
                stripped = line.strip()
                if not stripped:
                    continue
                lines.append(stripped)
                if not stripped.startswith("data:"):
                    continue
                payload_text = stripped[5:].strip()
                if not payload_text or payload_text == "[DONE]":
                    continue
                try:
                    evt = json.loads(payload_text)
                except json.JSONDecodeError:
                    continue
                if not isinstance(evt, dict):
                    continue
                base = evt.get("base_resp") or {}
                code = base.get("status_code", 0)
                if code != 0:
                    raise minimax_status_error(code, base.get("status_msg"))

            return "\n".join(lines)


async def _request_stream(
    base_url: str,
    headers: dict[str, str],
    base_payload: dict[str, Any],
    *,
    output_format: str,
    timeout: httpx.Timeout,
    endpoint: str,
) -> tuple[bytes, str, dict[str, Any]]:
    stream_payload = apply_music_request_format(
        dict(base_payload),
        use_stream=True,
        output_format=output_format,
    )
    sse_text = await _read_music_sse_response(
        f"{base_url.rstrip('/')}/music_generation",
        headers=headers,
        payload=stream_payload,
        timeout=timeout,
    )
    body, stream_meta = parse_music_sse_text(sse_text)
    return body, "", stream_meta.get("response") or {}


async def _request_non_stream(
    base_url: str,
    headers: dict[str, str],
    base_payload: dict[str, Any],
    *,
    output_format: str,
    timeout: httpx.Timeout,
    endpoint: str,
) -> tuple[bytes, str, dict[str, Any]]:
    json_payload = apply_music_request_format(
        dict(base_payload),
        use_stream=False,
        output_format=output_format,
    )
    resp = await post_json_with_retry(
        f"{base_url.rstrip('/')}/music_generation",
        headers=headers,
        payload=json_payload,
        timeout=timeout,
        endpoint=endpoint,
    )
    validate_music_response(resp)
    url, body = await resolve_music_audio_bytes(resp, output_format=output_format)
    return body, url, resp


async def request_music_audio(
    *,
    base_url: str,
    headers: dict[str, str],
    base_payload: dict[str, Any],
    prefer_stream: bool | None = None,
    output_format: str | None = None,
    timeout_seconds: float | None = None,
    endpoint_label: str = "/music_generation",
) -> tuple[bytes, str, dict[str, Any], bool]:
    """
    Official music_generation flow:
    - stream=true + output_format=hex (stream-only format per docs)
    - retry transient prep/rate-limit errors, then fall back to non-stream
    """
    use_stream = settings.minimax_music_stream if prefer_stream is None else prefer_stream
    fmt = output_format or settings.minimax_music_output_format
    timeout = minimax_timeout(timeout_seconds or settings.minimax_music_timeout_seconds)

    last_err: Exception | None = None
    if use_stream:
        for attempt in range(STREAM_ATTEMPTS):
            try:
                body, url, data = await _request_stream(
                    base_url,
                    headers,
                    base_payload,
                    output_format=fmt,
                    timeout=timeout,
                    endpoint=f"{endpoint_label}(stream)",
                )
                if body:
                    return body, url, data, True
            except (RuntimeError, httpx.HTTPError) as exc:
                last_err = exc
                if not is_retryable_minimax_error(exc) or attempt >= STREAM_ATTEMPTS - 1:
                    break
                delay = 8 * (attempt + 1)
                logger.warning(
                    "MiniMax music stream failed (attempt %s/%s): %s — retry in %ss",
                    attempt + 1,
                    STREAM_ATTEMPTS,
                    exc,
                    delay,
                )
                await asyncio.sleep(delay)

        if last_err:
            logger.warning(
                "MiniMax stream unavailable (%s), falling back to non-stream /music_generation",
                last_err,
            )

    try:
        body, url, data = await _request_non_stream(
            base_url,
            headers,
            base_payload,
            output_format=fmt,
            timeout=timeout,
            endpoint=endpoint_label,
        )
        return body, url, data, False
    except Exception as exc:
        if last_err:
            raise last_err from exc
        raise
