"""Tests for listen check-in resonance scoring."""

from app.services.listen_engagement import _resonance_score


def test_resonance_score_perfect_match():
    from types import SimpleNamespace

    work = SimpleNamespace(arousal=5.0, valence=5.0)
    score = _resonance_score(work, 5.0, 5.0)
    assert score >= 0.9


def test_resonance_score_missing_user_mood():
    from types import SimpleNamespace

    work = SimpleNamespace(arousal=5.0, valence=5.0)
    assert _resonance_score(work, None, None) == 0.0
