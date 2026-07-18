"""Tests for user webhook subscriptions and delivery."""

import hashlib
import hmac
import json
import uuid

import pytest

from app.database import SessionLocal
from app.models.schemas import GenerationJob, User
from app.services import job_webhooks as wh_service


@pytest.mark.requires_db
def test_create_webhook_validates_url():
    db = SessionLocal()
    try:
        user = User(
            email=f"wh-{uuid.uuid4()}@test.local",
            username=f"whuser_{uuid.uuid4().hex[:8]}",
            hashed_password="x",
        )
        db.add(user)
        db.commit()

        with pytest.raises(ValueError):
            wh_service.create_webhook(db, user.id, name="Bad", url="not-a-url")
    finally:
        db.close()


@pytest.mark.requires_db
def test_deliver_webhook_signs_payload(monkeypatch):
    db = SessionLocal()
    try:
        user = User(
            email=f"wh2-{uuid.uuid4()}@test.local",
            username=f"whuser2_{uuid.uuid4().hex[:8]}",
            hashed_password="x",
        )
        db.add(user)
        db.commit()

        secret, hook = wh_service.create_webhook(
            db,
            user.id,
            name="Hook",
            url="https://example.com/hook",
            events=["job.completed"],
        )

        job = GenerationJob(
            owner_id=user.id,
            job_type="single",
            status="completed",
            progress=1.0,
            result={"work_id": str(uuid.uuid4())},
        )
        db.add(job)
        db.commit()

        captured: dict = {}

        class FakeResp:
            status_code = 200

        def fake_post(url, content, headers, timeout, follow_redirects=False):
            captured["url"] = url
            captured["headers"] = headers
            captured["body"] = json.loads(content.decode("utf-8"))
            expected = hmac.new(secret.encode("utf-8"), content, hashlib.sha256).hexdigest()
            assert headers["X-Vibe-Signature"] == f"sha256={expected}"
            assert follow_redirects is False
            return FakeResp()

        monkeypatch.setattr("app.services.job_webhooks.httpx.post", fake_post)

        result = wh_service.deliver_webhook(str(hook.id), str(job.id), "job.completed")
        assert result["status_code"] == 200
        assert captured["body"]["event"] == "job.completed"
        assert captured["body"]["job"]["id"] == str(job.id)
    finally:
        db.close()
