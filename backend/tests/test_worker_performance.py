"""Worker runtime gates and generation capacity helpers."""

import pytest

from app.workers import worker_runtime


def test_run_async_reuses_event_loop():
    worker_runtime._worker_loop = None

    async def _once(value: int) -> int:
        return value + 1

    assert worker_runtime.run_async(_once(1)) == 2
    loop = worker_runtime._worker_loop
    assert loop is not None and not loop.is_closed()
    assert worker_runtime.run_async(_once(2)) == 3
    assert worker_runtime._worker_loop is loop


def test_generation_worker_slots_solo():
    from app.config import settings

    original_pool = settings.celery_worker_pool
    original_conc = settings.celery_worker_concurrency
    try:
        settings.celery_worker_pool = "solo"
        settings.celery_worker_concurrency = 4
        assert worker_runtime.generation_worker_slots() == 1
    finally:
        settings.celery_worker_pool = original_pool
        settings.celery_worker_concurrency = original_conc


def test_generation_worker_slots_prefork():
    from app.config import settings

    original_pool = settings.celery_worker_pool
    original_conc = settings.celery_worker_concurrency
    try:
        settings.celery_worker_pool = "prefork"
        settings.celery_worker_concurrency = 3
        assert worker_runtime.generation_worker_slots() == 3
    finally:
        settings.celery_worker_pool = original_pool
        settings.celery_worker_concurrency = original_conc


def test_can_parallel_variation_dispatch():
    from app.config import settings

    original_pool = settings.celery_worker_pool
    original_conc = settings.celery_worker_concurrency
    original_parallel = settings.variation_parallel
    try:
        settings.variation_parallel = True
        settings.celery_worker_pool = "solo"
        settings.celery_worker_concurrency = 1
        assert worker_runtime.can_parallel_variation_dispatch() is False

        settings.celery_worker_pool = "prefork"
        settings.celery_worker_concurrency = 2
        assert worker_runtime.can_parallel_variation_dispatch() is True

        settings.variation_parallel = False
        assert worker_runtime.can_parallel_variation_dispatch() is False
    finally:
        settings.celery_worker_pool = original_pool
        settings.celery_worker_concurrency = original_conc
        settings.variation_parallel = original_parallel


def test_wait_async_results_success():
    class _Ok:
        def ready(self) -> bool:
            return True

        def successful(self) -> bool:
            return True

    pending = [("a", _Ok())]
    worker_runtime.wait_async_results(pending, poll_seconds=0.01)
    assert pending == []


def test_wait_async_results_failure():
    class _Fail:
        def ready(self) -> bool:
            return True

        def successful(self) -> bool:
            return False

        @property
        def result(self):
            return "boom"

    pending = [("x", _Fail())]
    with pytest.raises(RuntimeError, match="Variation sub-task x failed"):
        worker_runtime.wait_async_results(pending, poll_seconds=0.01)


def test_generation_capacity_snapshot_keys():
    from app.services.queue_metrics import generation_capacity_snapshot

    snap = generation_capacity_snapshot()
    for key in (
        "active_workers",
        "generation_slots",
        "celery_depth",
        "priority_depth",
        "total_broker_depth",
        "avg_compose_seconds",
        "estimated_throughput_per_hour",
    ):
        assert key in snap
