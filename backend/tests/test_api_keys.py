import uuid

import pytest

from app.database import SessionLocal
from app.models.schemas import User
from app.services import api_keys as api_key_service


@pytest.mark.requires_db
def test_create_and_authenticate_api_key():
    db = SessionLocal()
    try:
        user = User(
            email=f"keytest-{uuid.uuid4()}@test.local",
            username=f"keyuser_{uuid.uuid4().hex[:8]}",
            hashed_password="x",
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        raw, row = api_key_service.create_api_key(db, user.id, "CI Key")
        assert raw.startswith("vsk_")
        assert row.key_prefix == raw[:12]

        authed = api_key_service.authenticate_api_key(db, raw)
        assert authed is not None
        assert authed.id == user.id

        assert api_key_service.revoke_api_key(db, user.id, row.id)
        assert api_key_service.authenticate_api_key(db, raw) is None
    finally:
        db.close()
