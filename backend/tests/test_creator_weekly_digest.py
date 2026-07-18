"""Creator weekly digest tests."""

import uuid

import pytest

from app.models.schemas import User
from app.services.creator_weekly_digest import get_creator_weekly_summary


@pytest.mark.requires_db
def test_creator_weekly_summary_shape(db):
    user = User(
        id=uuid.uuid4(),
        email=f"c-{uuid.uuid4().hex[:8]}@test.local",
        username=f"c_{uuid.uuid4().hex[:8]}",
        hashed_password="x",
    )
    db.add(user)
    db.commit()

    summary = get_creator_weekly_summary(db, user.id)
    assert "listens" in summary
    assert "tips" in summary
    assert "duel_mentions" in summary
