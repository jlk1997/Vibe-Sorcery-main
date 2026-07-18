"""Leaderboard service tests."""

import pytest

from app.services.leaderboards import CHART_TYPES, get_chart, get_chart_history


def test_chart_types_defined():
    assert "heat" in CHART_TYPES
    assert "resonance" in CHART_TYPES


@pytest.mark.requires_db
def test_get_chart_returns_payload(db):
    payload = get_chart(db, "heat", limit=5)
    assert payload["chart_type"] == "heat"
    assert "entries" in payload


@pytest.mark.requires_db
def test_get_chart_history_empty(db):
    payload = get_chart_history(db, "heat")
    assert payload["chart_type"] == "heat"
    assert "entries" in payload
