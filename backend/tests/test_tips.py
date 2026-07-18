"""Integration tests for creator tipping."""

import uuid

import pytest

from app.models.schemas import CreatorTip, CreatorWallet, CreditTransaction, Notification, User, UserCredit, Work
from app.services.credits import add_credits, get_or_create_credits
from app.services.ecosystem import tip_creator


@pytest.mark.requires_db
def test_tip_creator_transfers_credits(db):
    tipper_id = uuid.uuid4()
    creator_id = uuid.uuid4()
    work_id = uuid.uuid4()
    try:
        tipper = User(
            id=tipper_id,
            email=f"tipper-{uuid.uuid4().hex[:8]}@test.local",
            username=f"tipper_{uuid.uuid4().hex[:8]}",
            hashed_password="x",
        )
        creator = User(
            id=creator_id,
            email=f"creator-{uuid.uuid4().hex[:8]}@test.local",
            username=f"creator_{uuid.uuid4().hex[:8]}",
            hashed_password="x",
        )
        db.add_all([tipper, creator])
        db.commit()

        add_credits(db, tipper_id, 10, source="test_grant")
        db.commit()

        work = Work(
            id=work_id,
            owner_id=creator_id,
            title="Tip Target",
            audio_url="http://example.com/a.mp3",
        )
        db.add(work)
        db.commit()

        result = tip_creator(db, tipper, work_id=str(work_id), credits=3, public_message="Nice track!")
        assert result["tipped"] == 3
        assert result["public"] is True

        tip_row = db.query(CreatorTip).filter(CreatorTip.work_id == work_id).first()
        assert tip_row is not None
        assert tip_row.credits == 3

        wallet = db.query(CreatorWallet).filter(CreatorWallet.user_id == creator_id).first()
        assert wallet is not None
        assert wallet.balance_credits >= 3

        tipper_credits = get_or_create_credits(db, tipper_id)
        assert tipper_credits.balance == 7
    finally:
        user_ids = [tipper_id, creator_id]
        db.query(CreatorTip).filter(CreatorTip.work_id == work_id).delete()
        db.query(CreatorWallet).filter(CreatorWallet.user_id == creator_id).delete()
        db.query(Notification).filter(Notification.user_id.in_(user_ids)).delete()
        db.query(CreditTransaction).filter(CreditTransaction.user_id.in_(user_ids)).delete()
        db.query(UserCredit).filter(UserCredit.user_id.in_(user_ids)).delete()
        db.query(Work).filter(Work.id == work_id).delete()
        db.query(User).filter(User.id.in_(user_ids)).delete()
        db.commit()
