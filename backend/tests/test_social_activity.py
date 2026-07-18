"""Tests for social activity stream aggregation."""

import pytest

from app.services.social_activity import get_activity_stream


@pytest.mark.requires_db
def test_activity_stream_returns_list(db):
    events = get_activity_stream(db, None, limit=5)
    assert isinstance(events, list)


@pytest.mark.requires_db
def test_activity_following_empty_without_user(db):
    events = get_activity_stream(db, None, scope="following", limit=5)
    assert events == []
