"""Remix permission integration tests."""

import uuid

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.models.schemas import GenerationJob, User, Work
from app.services.auth import create_access_token, hash_password


@pytest.fixture
def client():
    return TestClient(app)


@pytest.mark.requires_db
def test_remix_custom_title(client, monkeypatch):
    suffix = uuid.uuid4().hex[:8]
    owner_name = f"remix_title_owner_{suffix}"
    remixer_name = f"remix_title_user_{suffix}"
    db = SessionLocal()
    try:
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

        work = Work(
            owner_id=owner.id,
            title=f"Source Track {suffix}",
            audio_url="http://example.com/a.mp3",
            visibility="public",
            allow_remix=True,
            license="allow_remix",
        )
        db.add(work)
        db.commit()

        monkeypatch.setattr(
            "app.api.routes.community.generate_single_task.apply_async",
            lambda *args, **kwargs: None,
        )

        token = create_access_token(str(remixer.id))
        custom_title = f"My Remix {suffix}"
        res = client.post(
            f"/api/v1/community/remix/{work.id}",
            json={"remix_intent": "make it happier", "title": custom_title},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200, res.text
        job_id = res.json()["job_id"]
        job = db.query(GenerationJob).filter(GenerationJob.id == uuid.UUID(job_id)).first()
        assert job is not None
        assert job.config.get("title") == custom_title
    finally:
        db.query(GenerationJob).filter(GenerationJob.job_type == "remix").delete(synchronize_session=False)
        db.query(Work).filter(Work.title.like("Source Track %")).delete(synchronize_session=False)
        db.query(User).filter(User.username.in_([owner_name, remixer_name])).delete(synchronize_session=False)
        db.commit()
        db.close()


@pytest.mark.requires_db
def test_remix_forbidden_when_owner_disallows(client):
    suffix = uuid.uuid4().hex[:8]
    owner_name = f"remix_owner_{suffix}"
    remixer_name = f"remix_user_{suffix}"
    db = SessionLocal()
    try:
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

        work = Work(
            owner_id=owner.id,
            title=f"No Remix Track {suffix}",
            audio_url="http://example.com/a.mp3",
            visibility="public",
            allow_remix=False,
            license="no_remix",
        )
        db.add(work)
        db.commit()

        token = create_access_token(str(remixer.id))
        res = client.post(
            f"/api/v1/community/remix/{work.id}",
            json={"remix_intent": "make it happier"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 403, res.text
        assert "二次创作" in res.json().get("detail", "")

        preview = client.post(
            "/api/v1/studio/remix/preview",
            json={"work_id": str(work.id), "remix_intent": "make it happier"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert preview.status_code == 403, preview.text
    finally:
        db.query(Work).filter(Work.title.like("No Remix Track %")).delete(synchronize_session=False)
        db.query(User).filter(User.username.in_([owner_name, remixer_name])).delete(synchronize_session=False)
        db.commit()
        db.close()
