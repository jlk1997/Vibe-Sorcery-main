import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

RETRYABLE = (
    httpx.RemoteProtocolError,
    httpx.ReadTimeout,
    httpx.ConnectTimeout,
    httpx.ConnectError,
    httpx.WriteError,
    httpx.ReadError,
    httpx.PoolTimeout,
    httpx.NetworkError,
)

RETRYABLE_STATUS = {429, 502, 503, 504}

_chat_client: httpx.AsyncClient | None = None
_music_client: httpx.AsyncClient | None = None
_inflight_semaphore: asyncio.Semaphore | None = None


def minimax_timeout(read_seconds: float) -> httpx.Timeout:
    return httpx.Timeout(connect=30.0, read=read_seconds, write=60.0, pool=30.0)


def _client_limits() -> httpx.Limits:
    max_conn = max(4, int(settings.minimax_http_max_connections))
    keepalive = max(2, min(max_conn, int(settings.minimax_http_max_keepalive)))
    return httpx.Limits(max_connections=max_conn, max_keepalive_connections=keepalive)


def create_minimax_client(timeout: httpx.Timeout) -> httpx.AsyncClient:
    """Ephemeral client (legacy). Prefer get_chat_client / get_music_client."""
    return httpx.AsyncClient(
        timeout=timeout,
        trust_env=settings.minimax_http_trust_env,
        limits=_client_limits(),
    )


def get_chat_client() -> httpx.AsyncClient:
    global _chat_client
    if _chat_client is None or _chat_client.is_closed:
        _chat_client = httpx.AsyncClient(
            timeout=minimax_timeout(settings.minimax_chat_timeout_seconds),
            trust_env=settings.minimax_http_trust_env,
            limits=_client_limits(),
        )
    return _chat_client


def get_music_client() -> httpx.AsyncClient:
    global _music_client
    if _music_client is None or _music_client.is_closed:
        _music_client = httpx.AsyncClient(
            timeout=minimax_timeout(settings.minimax_music_timeout_seconds),
            trust_env=settings.minimax_http_trust_env,
            limits=_client_limits(),
        )
    return _music_client


def _get_inflight_semaphore() -> asyncio.Semaphore:
    global _inflight_semaphore
    if _inflight_semaphore is None:
        slots = max(1, int(settings.minimax_max_inflight))
        _inflight_semaphore = asyncio.Semaphore(slots)
    return _inflight_semaphore


@asynccontextmanager
async def minimax_request_slot():
    """Limit concurrent upstream MiniMax calls to reduce RPM spikes (code 1002)."""
    sem = _get_inflight_semaphore()
    await sem.acquire()
    try:
        yield
    finally:
        sem.release()


async def close_minimax_http_pool() -> None:
    global _chat_client, _music_client, _inflight_semaphore
    for client in (_chat_client, _music_client):
        if client is not None and not client.is_closed:
            await client.aclose()
    _chat_client = None
    _music_client = None
    _inflight_semaphore = None


def close_minimax_http_pool_sync() -> None:
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(close_minimax_http_pool())
        else:
            loop.run_until_complete(close_minimax_http_pool())
    except RuntimeError:
        asyncio.run(close_minimax_http_pool())


async def post_text_with_retry(
    url: str,
    *,
    headers: dict[str, str],
    payload: dict[str, Any],
    timeout: httpx.Timeout,
    endpoint: str,
    retries: int | None = None,
) -> str:
    """POST and return raw response text (e.g. MiniMax music SSE stream)."""
    max_retries = retries if retries is not None else settings.minimax_http_retries
    last_exc: Exception | None = None
    client = get_music_client()

    for attempt in range(max_retries):
        try:
            async with minimax_request_slot():
                resp = await client.post(url, headers=headers, json=payload, timeout=timeout)
                resp.raise_for_status()
                return resp.text
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code in RETRYABLE_STATUS and attempt + 1 < max_retries:
                last_exc = exc
            else:
                raise
        except RETRYABLE as exc:
            last_exc = exc

        if attempt + 1 >= max_retries:
            break

        delay = min(30, 5 * (2**attempt))
        logger.warning(
            "MiniMax %s stream failed (attempt %s/%s): %s — retry in %ss",
            endpoint,
            attempt + 1,
            max_retries,
            last_exc,
            delay,
        )
        await asyncio.sleep(delay)

    raise RuntimeError(
        "MiniMax 音乐生成连接中断或超时。"
        "音乐生成通常需 1–3 分钟；若使用 VPN/代理，请在 .env 设置 MINIMAX_HTTP_TRUST_ENV=false 后重启 Worker。"
    ) from last_exc


async def post_json_with_retry(
    url: str,
    *,
    headers: dict[str, str],
    payload: dict[str, Any],
    timeout: httpx.Timeout,
    endpoint: str,
    retries: int | None = None,
    use_music_client: bool = False,
) -> dict[str, Any]:
    max_retries = retries if retries is not None else settings.minimax_http_retries
    last_exc: Exception | None = None
    client = get_music_client() if use_music_client else get_chat_client()

    for attempt in range(max_retries):
        try:
            async with minimax_request_slot():
                resp = await client.post(url, headers=headers, json=payload, timeout=timeout)
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code in RETRYABLE_STATUS and attempt + 1 < max_retries:
                last_exc = exc
            else:
                raise
        except RETRYABLE as exc:
            last_exc = exc

        if attempt + 1 >= max_retries:
            break

        delay = min(30, 5 * (2**attempt))
        logger.warning(
            "MiniMax %s failed (attempt %s/%s): %s — retry in %ss",
            endpoint,
            attempt + 1,
            max_retries,
            last_exc,
            delay,
        )
        await asyncio.sleep(delay)

    raise RuntimeError(
        "MiniMax 音乐生成连接中断或超时。"
        "音乐生成通常需 1–3 分钟；若使用 VPN/代理，请在 .env 设置 MINIMAX_HTTP_TRUST_ENV=false 后重启 Worker。"
    ) from last_exc


async def get_bytes_with_retry(
    url: str,
    *,
    timeout: httpx.Timeout,
    endpoint: str,
    retries: int | None = None,
) -> bytes:
    max_retries = retries if retries is not None else settings.minimax_http_retries
    last_exc: Exception | None = None
    client = get_music_client()

    for attempt in range(max_retries):
        try:
            async with minimax_request_slot():
                resp = await client.get(url, timeout=timeout)
                resp.raise_for_status()
                return resp.content
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code in RETRYABLE_STATUS and attempt + 1 < max_retries:
                last_exc = exc
            else:
                raise
        except RETRYABLE as exc:
            last_exc = exc

        if attempt + 1 >= max_retries:
            break

        delay = min(20, 3 * (2**attempt))
        logger.warning(
            "MiniMax %s download failed (attempt %s/%s): %s",
            endpoint,
            attempt + 1,
            max_retries,
            last_exc,
        )
        await asyncio.sleep(delay)

    raise RuntimeError("MiniMax 音频下载失败，请稍后重试。") from last_exc
