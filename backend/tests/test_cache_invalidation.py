"""Discovery cache invalidation helpers."""

from app.services.cache import _store, cache_set, invalidate_discovery_caches


def test_invalidate_discovery_caches_clears_local_store():
    cache_set("activity:global:anon:30", [{"type": "tip"}], ttl_seconds=60)
    cache_set("chart:heat:week:20", [{"id": "1"}], ttl_seconds=60)
    cache_set("feed:global", [{"id": "p1"}], ttl_seconds=60)

    invalidate_discovery_caches()

    assert "activity:global:anon:30" not in _store
    assert "chart:heat:week:20" not in _store
    assert "feed:global" not in _store
