"""Job progress publishes version bumps."""

import uuid

import pytest

from app.database import SessionLocal
from app.models.schemas import GenerationJob, User
from app.services.job_progress import update_job_phase


@pytest.mark.requires_db
def test_update_job_phase_increments_version():
    db = SessionLocal()
    try:
        user = User(
            email=f"jp-{uuid.uuid4()}@test.local",
            username=f"jp_{uuid.uuid4().hex[:8]}",
            hashed_password="x",
        )
        db.add(user)
        db.commit()

        job = GenerationJob(owner_id=user.id, job_type="single", status="running", config={}, version=1)
        db.add(job)
        db.commit()

        update_job_phase(db, job, progress=0.5, status_message="working", phase="composing")
        db.refresh(job)
        assert job.version == 2
    finally:
        db.close()
