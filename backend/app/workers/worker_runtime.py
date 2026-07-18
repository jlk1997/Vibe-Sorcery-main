"""Celery worker runtime helpers: asyncio loop reuse and parallel dispatch gates."""

from __future__ import annotations

import asyncio
import time
from typing import Any

from app.config import settings

_worker_loop: asyncio.AbstractEventLoop | None = None


def run_async(coro):
    """Reuse one event loop per worker process (enables HTTP connection pooling)."""
    global _worker_loop
    if _worker_loop is None or _worker_loop.is_closed():
        _worker_loop = asyncio.new_event_loop()
        asyncio.set_event_loop(_worker_loop)
    return _worker_loop.run_until_complete(coro)


def generation_worker_slots() -> int:
    pool = (settings.celery_worker_pool or "solo").lower()
    concurrency = max(1, int(settings.celery_worker_concurrency or 1))
    if pool == "solo":
        return 1
    return concurrency


def can_parallel_variation_dispatch() -> bool:
    """True when sub-tasks can be apply_async'd without self-deadlock."""
    if not settings.variation_parallel:
        return False
    pool = (settings.celery_worker_pool or "solo").lower()
    return pool != "solo" and generation_worker_slots() > 1


def wait_async_results(
    pending: list[tuple[str, Any]],
    *,
    poll_seconds: float = 2.0,
    timeout_seconds: float | None = None,
) -> None:
    """Block until all Celery AsyncResult/EagerResult entries are ready."""
    if not pending:
        return
    deadline = time.monotonic() + timeout_seconds if timeout_seconds else None
    while pending:
        remaining: list[tuple[str, Any]] = []
        for sub_id, result in pending:
            if result.ready():
                if not result.successful():
                    err = result.result
                    raise RuntimeError(f"Variation sub-task {sub_id} failed: {err}")
                continue
            remaining.append((sub_id, result))
        pending[:] = remaining
        if not pending:
            break
        if deadline and time.monotonic() >= deadline:
            raise TimeoutError("Variation sub-tasks timed out")
        time.sleep(poll_seconds)
