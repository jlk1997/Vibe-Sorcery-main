"""Ecosystem feature tests."""

import uuid

import pytest
from fastapi import HTTPException

from app.models.schemas import User, Work
from app.services.ecosystem import EXPORT_COSTS, MEMBER_FREE_MV_PER_MONTH, export_work


def test_export_costs_defined():
    assert "hq_wav" in EXPORT_COSTS
    assert "commercial_license" in EXPORT_COSTS
    assert EXPORT_COSTS["hq_mp3"] == 0


def test_member_mv_free_quota_constant():
    assert MEMBER_FREE_MV_PER_MONTH == 1


@pytest.mark.requires_db
def test_export_wav_returns_501(db):
    user_id = uuid.uuid4()
    work_id = uuid.uuid4()
    try:
        user = User(
            id=user_id,
            email=f"exp-{uuid.uuid4().hex[:8]}@test.local",
            username=f"exp_{uuid.uuid4().hex[:8]}",
            hashed_password="x",
        )
        work = Work(id=work_id, owner_id=user_id, title="Export Me", audio_url="http://x/a.mp3")
        db.add_all([user, work])
        db.commit()

        with pytest.raises(HTTPException) as exc:
            export_work(db, user, str(work_id), "hq_wav")
        assert exc.value.status_code == 501
    finally:
        db.query(Work).filter(Work.id == work_id).delete()
        db.query(User).filter(User.id == user_id).delete()
        db.commit()
