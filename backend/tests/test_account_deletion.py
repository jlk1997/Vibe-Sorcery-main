"""Account deletion service tests."""

import uuid
from datetime import datetime, timedelta

import pytest

from app.models.schemas import User
from app.services.account_deletion import (
    DELETION_GRACE_DAYS,
    cancel_account_deletion,
    finalize_pending_deletions,
)


def test_finalize_pending_deletions_importable():
    assert callable(finalize_pending_deletions)


@pytest.mark.requires_db
def test_finalize_pending_deletions_past_grace(db):
    user_id = uuid.uuid4()
    user = User(
        id=user_id,
        email=f"del-{uuid.uuid4().hex[:8]}@test.local",
        username=f"del_{uuid.uuid4().hex[:8]}",
        hashed_password="x",
        deletion_scheduled_at=datetime.utcnow() - timedelta(days=DELETION_GRACE_DAYS + 1),
        is_active=True,
    )
    db.add(user)
    db.commit()

    count = finalize_pending_deletions(db)
    assert count >= 1

    db.refresh(user)
    assert user.deleted_at is not None
    assert user.is_active is False
    assert user.deletion_scheduled_at is not None


@pytest.mark.requires_db
def test_cancel_account_deletion(db):
    user_id = uuid.uuid4()
    user = User(
        id=user_id,
        email=f"cancel-{uuid.uuid4().hex[:8]}@test.local",
        username=f"cancel_{uuid.uuid4().hex[:8]}",
        hashed_password="x",
        deletion_scheduled_at=datetime.utcnow(),
        is_active=False,
    )
    db.add(user)
    db.commit()

    result = cancel_account_deletion(db, user)
    assert result["cancelled"] is True
    db.refresh(user)
    assert user.deletion_scheduled_at is None
    assert user.is_active is True
