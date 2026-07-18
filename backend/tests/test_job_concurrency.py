"""Job state machine and post-process counter tests."""

import uuid

import pytest

from app.database import SessionLocal
from app.models.schemas import GenerationJob, User
from app.services.job_state import (
    ACTIVE_JOB_STATUSES,
    begin_post_processing,
    mark_audio_ready,
    on_post_process_finished,
    transition_job,
)


@pytest.mark.requires_db
def test_transition_job_for_update():
    db = SessionLocal()
    try:
        user = User(
            email=f"js-{uuid.uuid4()}@test.local",
            username=f"js_{uuid.uuid4().hex[:8]}",
            hashed_password="x",
        )
        db.add(user)
        db.commit()

        job = GenerationJob(owner_id=user.id, job_type="single", status="pending", config={})
        db.add(job)
        db.commit()

        updated = transition_job(db, job.id, ("pending",), "running", phase="queued")
        assert updated is not None
        assert updated.status == "running"
        assert updated.phase == "queued"
    finally:
        db.close()


@pytest.mark.requires_db
def test_post_process_counter_completes_once():
    db = SessionLocal()
    try:
        user = User(
            email=f"pp-{uuid.uuid4()}@test.local",
            username=f"pp_{uuid.uuid4().hex[:8]}",
            hashed_password="x",
        )
        db.add(user)
        db.commit()

        job = GenerationJob(
            owner_id=user.id,
            job_type="playlist",
            status="running",
            config={"credits_charged": 0},
            result={"work_ids": ["a", "b"]},
        )
        db.add(job)
        db.commit()

        mark_audio_ready(db, job.id, result=job.result)
        begin_post_processing(db, job.id, 2, result=job.result)

        first = on_post_process_finished(db, job.id, work_patch={"work_id": "a"})
        assert first.status == "post_processing"

        second = on_post_process_finished(db, job.id, work_patch={"work_id": "b"})
        assert second.status == "completed"
        assert second.progress == 1.0
    finally:
        db.close()


@pytest.mark.requires_db
def test_complete_at_audio_ready():
    db = SessionLocal()
    try:
        user = User(
            email=f"ca-{uuid.uuid4()}@test.local",
            username=f"ca_{uuid.uuid4().hex[:8]}",
            hashed_password="x",
        )
        db.add(user)
        db.commit()

        job = GenerationJob(
            owner_id=user.id,
            job_type="single",
            status="running",
            config={"credits_charged": 0},
        )
        db.add(job)
        db.commit()

        from app.services.job_state import complete_at_audio_ready

        result = {"work_id": "w1", "audio_url": "http://example/a.mp3", "title": "Track"}
        updated = complete_at_audio_ready(db, job.id, result=result)
        assert updated is not None
        assert updated.status == "completed"
        assert updated.phase == "done"
        assert updated.progress == 1.0
        assert updated.result == result
    finally:
        db.close()


def test_active_statuses_include_post_processing():
    assert "post_processing" in ACTIVE_JOB_STATUSES
    assert "audio_ready" in ACTIVE_JOB_STATUSES
