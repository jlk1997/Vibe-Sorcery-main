"""Credits gate unit tests (no DB required)."""

from app.services.generation_gate import with_credits_charged


def test_with_credits_charged_merges_config():
    merged = with_credits_charged({"steps": 6}, 3)
    assert merged["credits_charged"] == 3
    assert merged["steps"] == 6


def test_with_credits_charged_zero_skips():
    assert with_credits_charged({"steps": 6}, 0) == {"steps": 6}
