"""Redis-backed sliding window rate limiter with in-process fallback (dev only)."""

from __future__ import annotations

import logging
import time
from collections import defaultdict, deque

from fastapi import HTTPException, status

logger = logging.getLogger(__name__)

DEFAULT_LIMIT = 120
DEFAULT_WINDOW_SECONDS = 60

_memory_buckets: dict[str, deque[float]] = defaultdict(deque)
_redis_client = None
_redis_checked = False


def _get_redis():
    global _redis_client, _redis_checked
    if _redis_checked:
        return _redis_client
    _redis_checked = True
    try:
        from app.config import settings
        import redis

        _redis_client = redis.from_url(settings.redis_url, decode_responses=True)
        _redis_client.ping()
    except Exception as exc:
        logger.info("Redis rate limit unavailable: %s", exc)
        _redis_client = None
    return _redis_client


def reset_redis_client_for_tests() -> None:
    global _redis_client, _redis_checked
    _redis_client = None
    _redis_checked = False


def get_rate_limit_count(
    key: str,
    *,
    window_seconds: float = DEFAULT_WINDOW_SECONDS,
) -> int:
    """Return how many events are counted in the current sliding window."""
    r = _get_redis()
    if r is not None:
        now = time.time()
        redis_key = f"rl:{key}"
        r.zremrangebyscore(redis_key, 0, now - window_seconds)
        return int(r.zcard(redis_key))

    now = time.monotonic()
    bucket = _memory_buckets[key]
    while bucket and now - bucket[0] >= window_seconds:
        bucket.popleft()
    return len(bucket)


def check_rate_limit(
    key: str,
    *,
    limit: int = DEFAULT_LIMIT,
    window_seconds: float = DEFAULT_WINDOW_SECONDS,
    fail_closed: bool | None = None,
) -> None:
    from app.config import settings

    if fail_closed is None:
        fail_closed = settings.rate_limit_fail_closed

    r = _get_redis()
    if r is not None:
        _check_redis(r, key, limit=limit, window_seconds=window_seconds)
        return

    if fail_closed:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Rate limiting unavailable; try again later",
        )
    _check_memory(key, limit=limit, window_seconds=window_seconds)


def _check_redis(r, key: str, *, limit: int, window_seconds: float) -> None:
    now = time.time()
    redis_key = f"rl:{key}"
    pipe = r.pipeline()
    pipe.zremrangebyscore(redis_key, 0, now - window_seconds)
    pipe.zadd(redis_key, {str(now): now})
    pipe.zcard(redis_key)
    pipe.expire(redis_key, int(window_seconds) + 1)
    _, _, count, _ = pipe.execute()
    if count > limit:
        r.zrem(redis_key, str(now))
        oldest = r.zrange(redis_key, 0, 0, withscores=True)
        retry_after = max(1, int(window_seconds))
        if oldest:
            retry_after = max(1, int(window_seconds - (now - oldest[0][1])))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "RATE_LIMITED",
                "message": "API rate limit exceeded, retry later",
                "retry_after_seconds": retry_after,
            },
        )


def _check_memory(key: str, *, limit: int, window_seconds: float) -> None:
    now = time.monotonic()
    bucket = _memory_buckets[key]
    while bucket and now - bucket[0] >= window_seconds:
        bucket.popleft()
    if len(bucket) >= limit:
        retry_after = max(1, int(window_seconds - (now - bucket[0]))) if bucket else int(window_seconds)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "RATE_LIMITED",
                "message": "API rate limit exceeded, retry later",
                "retry_after_seconds": retry_after,
            },
        )
    bucket.append(now)
