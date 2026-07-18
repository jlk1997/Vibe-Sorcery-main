"""Tests for post_process status flags on works."""

import uuid

import pytest

from app.database import SessionLocal
from app.models.schemas import User, Work
from app.services.post_process import _merge_post_process_status


@pytest.mark.requires_db
def test_merge_post_process_status():
    db = SessionLocal()
    try:
        user = User(
            email=f"pps-{uuid.uuid4()}@test.local",
            username=f"pps_{uuid.uuid4().hex[:8]}",
            hashed_password="x",
        )
        db.add(user)
        db.commit()
        work = Work(
            owner_id=user.id,
            title="Test",
            audio_url="http://example.com/a.mp3",
            post_process_status={},
        )
        db.add(work)
        db.commit()

        _merge_post_process_status(work, c2pa_done=True, hls_done=True)
        db.commit()
        db.refresh(work)
        assert work.post_process_status.get("c2pa_done") is True
        assert work.post_process_status.get("hls_done") is True
    finally:
        db.close()
