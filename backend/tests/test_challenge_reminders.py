"""Challenge reminder tests."""

import uuid
from datetime import datetime, timedelta

import pytest

from app.models.schemas import Challenge, ChallengeEntry, User, Work
from app.services.challenge_reminders import remind_ending_challenges


@pytest.mark.requires_db
def test_remind_ending_challenges_sends(db):
    user = User(
        id=uuid.uuid4(),
        email=f"r-{uuid.uuid4().hex[:8]}@test.local",
        username=f"r_{uuid.uuid4().hex[:8]}",
        hashed_password="x",
    )
    db.add(user)
    db.commit()

    challenge = Challenge(
        slug=f"end-{uuid.uuid4().hex[:8]}",
        title="Ending Soon",
        hashtag="End",
        is_active=True,
        ends_at=datetime.utcnow() + timedelta(hours=12),
    )
    db.add(challenge)
    db.flush()
    work = Work(id=uuid.uuid4(), owner_id=user.id, title="W", audio_url="http://x/a.mp3")
    db.add(work)
    db.flush()
    db.add(ChallengeEntry(challenge_id=challenge.id, user_id=user.id, work_id=work.id))
    db.commit()

    sent = remind_ending_challenges(db, hours_before=24)
    assert sent >= 1
