"""Idempotency key deduplication tests."""

import uuid

import pytest

from app.database import SessionLocal
from app.models.schemas import GenerationJob, User
from app.services.generation_jobs import create_generation_job, lookup_idempotent_job


@pytest.mark.requires_db
def test_idempotency_key_returns_same_job():
    db = SessionLocal()
    try:
        user = User(
            email=f"idp-{uuid.uuid4()}@test.local",
            username=f"idp_{uuid.uuid4().hex[:8]}",
            hashed_password="x",
        )
        db.add(user)
        db.commit()

        key = str(uuid.uuid4())
        job1 = create_generation_job(
            db,
            user,
            job_type="single",
            config={"text_intent": "test"},
            idempotency_key=key,
        )
        found = lookup_idempotent_job(db, user, key)
        assert found is not None
        assert found.id == job1.id
    finally:
        db.close()


@pytest.mark.requires_db
def test_different_idempotency_keys_create_distinct_jobs():
    db = SessionLocal()
    try:
        user = User(
            email=f"idp2-{uuid.uuid4()}@test.local",
            username=f"idp2_{uuid.uuid4().hex[:8]}",
            hashed_password="x",
        )
        db.add(user)
        db.commit()

        job1 = create_generation_job(db, user, job_type="single", config={}, idempotency_key=str(uuid.uuid4()))
        job1.status = "completed"
        db.commit()
        job2 = create_generation_job(db, user, job_type="single", config={}, idempotency_key=str(uuid.uuid4()))
        assert job1.id != job2.id
    finally:
        db.close()
