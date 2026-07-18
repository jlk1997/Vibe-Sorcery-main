import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.database import SessionLocal
from app.models.schemas import Challenge, ChallengeEntry, Post, User, Work
from app.services.auth import create_access_token, hash_password


@pytest.fixture
def client():
    return TestClient(app)


@pytest.mark.requires_db
def test_enter_challenge(client):
    suffix = uuid.uuid4().hex[:8]
    username = f"challenge_enter_{suffix}"
    slug = f"test-challenge-{suffix}"
    db = SessionLocal()
    try:
        user = User(
            email=f"{username}@test.local",
            username=username,
            hashed_password=hash_password("testpass123"),
        )
        db.add(user)
        db.flush()

        work = Work(
            owner_id=user.id,
            title=f"Test Track {suffix}",
            audio_url="http://example.com/a.mp3",
            visibility="private",
        )
        db.add(work)
        db.flush()

        challenge = Challenge(
            slug=slug,
            title="Test Challenge",
            hashtag="testcalm",
            target_curve="calm_to_energy",
            is_active=True,
        )
        db.add(challenge)
        db.commit()

        token = create_access_token(str(user.id))
        res = client.post(
            f"/api/v1/challenges/{slug}/enter",
            json={"work_id": str(work.id), "caption": "My entry"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body.get("entry_id")
        assert body.get("post_id")
    finally:
        db.rollback()
        work_row = db.query(Work).filter(Work.title == f"Test Track {suffix}").first()
        if work_row:
            db.query(ChallengeEntry).filter(ChallengeEntry.work_id == work_row.id).delete()
            db.query(Post).filter(Post.work_id == work_row.id).delete()
            db.query(Work).filter(Work.id == work_row.id).delete()
        db.query(Challenge).filter(Challenge.slug == slug).delete()
        db.query(User).filter(User.username == username).delete()
        db.commit()
        db.close()
