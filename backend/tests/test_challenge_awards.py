"""Tests for challenge award distribution."""

import uuid
from datetime import datetime, timedelta

import pytest

from app.models.schemas import Challenge
from app.services.challenge_awards import distribute_challenge_prizes


@pytest.mark.requires_db
def test_distribute_skips_when_not_ended(db):
    slug = f"future-{uuid.uuid4().hex[:8]}"
    challenge = Challenge(
        slug=slug,
        title="Future",
        hashtag="future",
        prize_pool_credits=10,
        ends_at=datetime.utcnow() + timedelta(days=2),
        is_active=True,
    )
    db.add(challenge)
    db.commit()

    result = distribute_challenge_prizes(db, challenge)
    assert result.get("skipped") is True
    assert result.get("reason") == "not_ended"


@pytest.mark.requires_db
def test_distribute_marks_no_pool(db):
    slug = f"empty-{uuid.uuid4().hex[:8]}"
    challenge = Challenge(
        slug=slug,
        title="Empty",
        hashtag="empty",
        prize_pool_credits=0,
        ends_at=datetime.utcnow() - timedelta(hours=1),
        is_active=True,
    )
    db.add(challenge)
    db.commit()

    result = distribute_challenge_prizes(db, challenge)
    assert result.get("skipped") is True
    db.refresh(challenge)
    assert challenge.awards_distributed is True
