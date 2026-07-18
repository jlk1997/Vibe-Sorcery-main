"""Credits gate, task rewards, and refund tests."""

import uuid

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.models.schemas import FeatureFlag, GenerationJob, User, UserCredit, UserTaskProgress, Work
from app.services.auth import create_access_token, hash_password
from app.services.generation_gate import refund_job_credits_if_needed


@pytest.fixture
def client():
    return TestClient(app)


def _ensure_credits_gate_on(db):
    flag = db.query(FeatureFlag).filter(FeatureFlag.key == "credits_gate").first()
    if not flag:
        db.add(
            FeatureFlag(
                key="credits_gate",
                enabled=True,
                description="Enable generation credits gate (402 when insufficient)",
            )
        )
    else:
        flag.enabled = True
    db.commit()


@pytest.mark.requires_db
def test_credits_gate_blocks_generation_at_zero_balance(client):
    suffix = uuid.uuid4().hex[:8]
    username = f"gate_user_{suffix}"
    db = SessionLocal()
    user_id = None
    try:
        _ensure_credits_gate_on(db)
        user = User(
            email=f"{username}@test.local",
            username=username,
            hashed_password=hash_password("testpass123"),
        )
        db.add(user)
        db.flush()
        user_id = user.id
        db.add(UserCredit(user_id=user.id, balance=0))
        db.commit()

        token = create_access_token(str(user.id))
        res = client.post(
            "/api/v1/works/generate/single",
            json={"text_intent": "calm ambient track", "instrumental": True, "title": "Test"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 402, res.text
    finally:
        if user_id:
            db.query(UserTaskProgress).filter(UserTaskProgress.user_id == user_id).delete(synchronize_session=False)
            db.query(UserCredit).filter(UserCredit.user_id == user_id).delete(synchronize_session=False)
            db.query(User).filter(User.id == user_id).delete(synchronize_session=False)
            db.commit()
        db.close()


@pytest.mark.requires_db
def test_complete_task_increases_balance():
    from app.services.user_engagement import complete_task

    suffix = uuid.uuid4().hex[:8]
    username = f"task_user_{suffix}"
    db = SessionLocal()
    user_id = None
    try:
        user = User(
            email=f"{username}@test.local",
            username=username,
            hashed_password=hash_password("testpass123"),
        )
        db.add(user)
        db.flush()
        user_id = user.id
        db.add(UserCredit(user_id=user.id, balance=5))
        db.commit()

        result = complete_task(db, user.id, "first_publish")
        assert result is not None
        assert result.get("credits_granted", 0) > 0
        row = db.query(UserCredit).filter(UserCredit.user_id == user.id).first()
        assert row is not None
        assert row.balance == 5 + result["credits_granted"]
    finally:
        if user_id:
            db.query(UserTaskProgress).filter(UserTaskProgress.user_id == user_id).delete(synchronize_session=False)
            db.query(UserCredit).filter(UserCredit.user_id == user_id).delete(synchronize_session=False)
            db.query(User).filter(User.id == user_id).delete(synchronize_session=False)
            db.commit()
        db.close()


@pytest.mark.requires_db
def test_refund_job_credits_if_needed():
    suffix = uuid.uuid4().hex[:8]
    username = f"refund_user_{suffix}"
    db = SessionLocal()
    user_id = None
    job_id = None
    try:
        user = User(
            email=f"{username}@test.local",
            username=username,
            hashed_password=hash_password("testpass123"),
        )
        db.add(user)
        db.flush()
        user_id = user.id
        db.add(UserCredit(user_id=user.id, balance=0))
        db.flush()
        job = GenerationJob(
            owner_id=user.id,
            job_type="single",
            status="failed",
            progress=0.0,
            config={"credits_charged": 1},
        )
        db.add(job)
        db.commit()
        job_id = job.id

        refunded = refund_job_credits_if_needed(db, job)
        assert refunded == 1
        row = db.query(UserCredit).filter(UserCredit.user_id == user.id).first()
        assert row is not None
        assert row.balance == 1
    finally:
        if job_id:
            db.query(GenerationJob).filter(GenerationJob.id == job_id).delete(synchronize_session=False)
        if user_id:
            db.query(UserCredit).filter(UserCredit.user_id == user_id).delete(synchronize_session=False)
            db.query(User).filter(User.id == user_id).delete(synchronize_session=False)
            db.commit()
        db.close()


@pytest.mark.requires_db
def test_remix_response_includes_credits_balance(client, monkeypatch):
    suffix = uuid.uuid4().hex[:8]
    owner_name = f"remix_bal_owner_{suffix}"
    remixer_name = f"remix_bal_user_{suffix}"
    db = SessionLocal()
    owner_id = None
    remixer_id = None
    work_id = None
    try:
        _ensure_credits_gate_on(db)
        owner = User(
            email=f"{owner_name}@test.local",
            username=owner_name,
            hashed_password=hash_password("testpass123"),
        )
        remixer = User(
            email=f"{remixer_name}@test.local",
            username=remixer_name,
            hashed_password=hash_password("testpass123"),
        )
        db.add_all([owner, remixer])
        db.flush()
        owner_id = owner.id
        remixer_id = remixer.id
        db.add(UserCredit(user_id=remixer.id, balance=10))

        work = Work(
            owner_id=owner.id,
            title=f"Source {suffix}",
            audio_url="http://example.com/a.mp3",
            visibility="public",
            allow_remix=True,
            license="allow_remix",
        )
        db.add(work)
        db.commit()
        work_id = work.id

        monkeypatch.setattr(
            "app.api.routes.community.generate_single_task.apply_async",
            lambda *args, **kwargs: None,
        )

        token = create_access_token(str(remixer.id))
        res = client.post(
            f"/api/v1/community/remix/{work.id}",
            json={"remix_intent": "make it happier"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert "credits_balance" in body
        assert body["credits_balance"] == 9
    finally:
        if work_id:
            db.query(GenerationJob).filter(GenerationJob.job_type == "remix").delete(synchronize_session=False)
            db.query(Work).filter(Work.id == work_id).delete(synchronize_session=False)
        for uid in (owner_id, remixer_id):
            if uid:
                db.query(UserCredit).filter(UserCredit.user_id == uid).delete(synchronize_session=False)
                db.query(User).filter(User.id == uid).delete(synchronize_session=False)
        db.commit()
        db.close()
