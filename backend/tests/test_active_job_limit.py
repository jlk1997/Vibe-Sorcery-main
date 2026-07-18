"""Per-user active generation job limit."""

import uuid

import pytest
from fastapi import HTTPException

from app.database import SessionLocal
from app.models.schemas import GenerationJob, User
from app.services.active_job_limit import enforce_active_job_limit, max_active_jobs


@pytest.mark.requires_db
def test_active_job_limit_blocks_second_job():
    db = SessionLocal()
    try:
        user = User(
            email=f"al-{uuid.uuid4()}@test.local",
            username=f"al_{uuid.uuid4().hex[:8]}",
            hashed_password="x",
        )
        db.add(user)
        db.commit()

        db.add(
            GenerationJob(
                owner_id=user.id,
                job_type="single",
                status="running",
                config={},
            )
        )
        db.commit()

        assert max_active_jobs(db, user.id) == 1
        with pytest.raises(HTTPException) as exc:
            enforce_active_job_limit(db, user)
        assert exc.value.status_code == 409
        assert exc.value.detail["code"] == "ACTIVE_JOB_LIMIT"
    finally:
        db.close()


@pytest.mark.requires_db
def test_completed_job_does_not_count_toward_limit():
    db = SessionLocal()
    try:
        user = User(
            email=f"al2-{uuid.uuid4()}@test.local",
            username=f"al2_{uuid.uuid4().hex[:8]}",
            hashed_password="x",
        )
        db.add(user)
        db.commit()

        db.add(
            GenerationJob(
                owner_id=user.id,
                job_type="single",
                status="completed",
                config={},
            )
        )
        db.commit()

        enforce_active_job_limit(db, user)
    finally:
        db.close()


@pytest.mark.requires_db
@pytest.mark.parametrize("status", ["audio_ready", "post_processing"])
def test_non_running_active_statuses_count(status: str):
    db = SessionLocal()
    try:
        user = User(
            email=f"al3-{uuid.uuid4()}@test.local",
            username=f"al3_{uuid.uuid4().hex[:8]}",
            hashed_password="x",
        )
        db.add(user)
        db.commit()

        db.add(GenerationJob(owner_id=user.id, job_type="single", status=status, config={}))
        db.commit()

        with pytest.raises(HTTPException) as exc:
            enforce_active_job_limit(db, user)
        assert exc.value.status_code == 409
    finally:
        db.close()
