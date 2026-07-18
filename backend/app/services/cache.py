"""Lightweight TTL cache with optional Redis backend for multi-instance consistency."""

from __future__ import annotations

import json
import logging
import time
from functools import wraps
from typing import Any, Callable, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")

_store: dict[str, tuple[float, Any]] = {}
_redis_client = None
_redis_checked = False
CACHE_PREFIX = "cache:"


def _get_redis():
    global _redis_client, _redis_checked
    if _redis_checked:
        return _redis_client
    _redis_checked = True
    try:
        from app.config import settings
        import redis

        client = redis.from_url(settings.redis_url, decode_responses=True)
        client.ping()
        _redis_client = client
    except Exception as exc:
        logger.debug("Redis cache unavailable, using in-process store: %s", exc)
        _redis_client = None
    return _redis_client


def cache_get(key: str) -> Any | None:
    r = _get_redis()
    if r is not None:
        try:
            raw = r.get(f"{CACHE_PREFIX}{key}")
            if raw is None:
                return None
            return json.loads(raw)
        except Exception:
            logger.debug("Redis cache get failed for %s", key, exc_info=True)

    row = _store.get(key)
    if not row:
        return None
    expires_at, value = row
    if time.monotonic() >= expires_at:
        _store.pop(key, None)
        return None
    return value


def cache_set(key: str, value: Any, ttl_seconds: float) -> None:
    r = _get_redis()
    if r is not None:
        try:
            r.setex(f"{CACHE_PREFIX}{key}", int(max(ttl_seconds, 1)), json.dumps(value, default=str))
            return
        except Exception:
            logger.debug("Redis cache set failed for %s", key, exc_info=True)

    _store[key] = (time.monotonic() + ttl_seconds, value)


def invalidate_discovery_caches() -> None:
    """Clear feed, activity stream, chart, and rising-creator caches after social events."""
    cache_clear("activity:")
    cache_clear("chart:")
    cache_clear("feed:")
    cache_clear("rising_creators:")


def cache_clear(prefix: str | None = None) -> None:
    r = _get_redis()
    if r is not None and prefix is not None:
        try:
            pattern = f"{CACHE_PREFIX}{prefix}*"
            cursor = 0
            while True:
                cursor, keys = r.scan(cursor=cursor, match=pattern, count=100)
                if keys:
                    r.delete(*keys)
                if cursor == 0:
                    break
        except Exception:
            logger.debug("Redis cache clear failed for prefix %s", prefix, exc_info=True)

    if prefix is None:
        _store.clear()
        return
    for key in list(_store):
        if key.startswith(prefix):
            _store.pop(key, None)


def cached(ttl_seconds: float, key_fn: Callable[..., str] | None = None):
    """Decorator for pure functions — key defaults to func name + args repr."""

    def decorator(fn: Callable[..., T]) -> Callable[..., T]:
        @wraps(fn)
        def wrapper(*args, **kwargs) -> T:
            key = key_fn(*args, **kwargs) if key_fn else f"{fn.__name__}:{args!r}:{kwargs!r}"
            hit = cache_get(key)
            if hit is not None:
                return hit
            value = fn(*args, **kwargs)
            cache_set(key, value, ttl_seconds)
            return value

        return wrapper

    return decorator
