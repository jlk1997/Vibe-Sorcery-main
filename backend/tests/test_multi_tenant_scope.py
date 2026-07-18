"""Multi-tenant scope isolation smoke tests."""

import uuid

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.models.schemas import FeatureFlag, User, Work
from app.services.auth import create_access_token, hash_password


@pytest.fixture
def client():
    return TestClient(app)


@pytest.mark.requires_db
def test_multi_tenant_flag_defaults_off(client):
    db = SessionLocal()
    try:
        flag = db.query(FeatureFlag).filter(FeatureFlag.key == "multi_tenant").first()
        assert flag is not None
        assert flag.enabled is False
    finally:
        db.close()


@pytest.mark.requires_db
def test_works_scoped_to_owner(client):
    suffix = uuid.uuid4().hex[:8]
    db = SessionLocal()
    user_a_id = user_b_id = None
    try:
        user_a = User(email=f"a_{suffix}@t.com", username=f"a_{suffix}", hashed_password=hash_password("x"), tenant_id="default")
        user_b = User(email=f"b_{suffix}@t.com", username=f"b_{suffix}", hashed_password=hash_password("x"), tenant_id="default")
        db.add_all([user_a, user_b])
        db.flush()
        user_a_id, user_b_id = user_a.id, user_b.id
        db.add(
            Work(
                owner_id=user_a.id,
                title="Private A",
                audio_url="http://localhost/mock.mp3",
                visibility="private",
                tenant_id="default",
            )
        )
        db.commit()

        token_b = create_access_token(str(user_b.id))
        res = client.get("/api/v1/works", headers={"Authorization": f"Bearer {token_b}"})
        assert res.status_code == 200
        titles = [w.get("title") for w in res.json()]
        assert "Private A" not in titles
    finally:
        if user_a_id:
            db.query(Work).filter(Work.owner_id == user_a_id).delete(synchronize_session=False)
            db.query(User).filter(User.id == user_a_id).delete(synchronize_session=False)
        if user_b_id:
            db.query(User).filter(User.id == user_b_id).delete(synchronize_session=False)
        db.commit()
        db.close()


@pytest.mark.requires_db
def test_challenge_scoped_when_multi_tenant(client):
    """User in tenant B cannot see tenant A challenge with same slug."""
    suffix = uuid.uuid4().hex[:8]
    slug = f"mt-scope-{suffix}"
    db = SessionLocal()
    user_a_id = user_b_id = None
    challenge_a_id = None
    try:
        flag = db.query(FeatureFlag).filter(FeatureFlag.key == "multi_tenant").first()
        assert flag is not None
        flag.enabled = True
        db.commit()

        user_a = User(
            email=f"mta_{suffix}@t.com",
            username=f"mta_{suffix}",
            hashed_password=hash_password("x"),
            tenant_id="tenant-a",
        )
        user_b = User(
            email=f"mtb_{suffix}@t.com",
            username=f"mtb_{suffix}",
            hashed_password=hash_password("x"),
            tenant_id="tenant-b",
        )
        db.add_all([user_a, user_b])
        db.flush()
        user_a_id, user_b_id = user_a.id, user_b.id

        from app.models.schemas import Challenge

        ch_a = Challenge(
            slug=slug,
            title="Tenant A Challenge",
            hashtag=f"#mta{suffix}",
            tenant_id="tenant-a",
            is_active=True,
        )
        db.add(ch_a)
        db.commit()
        challenge_a_id = ch_a.id

        token_b = create_access_token(str(user_b.id))
        res = client.get(f"/api/v1/challenges/{slug}", headers={"Authorization": f"Bearer {token_b}"})
        assert res.status_code == 404
    finally:
        if challenge_a_id:
            db.query(Challenge).filter(Challenge.id == challenge_a_id).delete(synchronize_session=False)
        if user_a_id:
            db.query(User).filter(User.id == user_a_id).delete(synchronize_session=False)
        if user_b_id:
            db.query(User).filter(User.id == user_b_id).delete(synchronize_session=False)
        flag = db.query(FeatureFlag).filter(FeatureFlag.key == "multi_tenant").first()
        if flag:
            flag.enabled = False
        db.commit()
        db.close()
