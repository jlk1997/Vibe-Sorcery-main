"""Payment order idempotency tests."""

import uuid

import pytest

from app.database import SessionLocal
from app.models.schemas import PaymentOrder, User
from app.services.payment_orders import complete_paid_order, mark_order_paid, register_pending_order


@pytest.mark.requires_db
def test_mark_order_paid_is_idempotent():
    db = SessionLocal()
    user_id = uuid.uuid4()
    out_trade_no = f"test_{uuid.uuid4().hex}"
    try:
        user = User(
            id=user_id,
            email=f"pay-{uuid.uuid4().hex[:8]}@test.local",
            username=f"payuser_{uuid.uuid4().hex[:8]}",
            hashed_password="x",
        )
        db.add(user)
        db.commit()

        register_pending_order(
            db,
            user_id=user_id,
            pack_id="pack_10",
            channel="mock",
            out_trade_no=out_trade_no,
            amount_fen=1000,
        )
        first = mark_order_paid(db, out_trade_no, "ext-1")
        second = mark_order_paid(db, out_trade_no, "ext-2")
        assert first is not None and first.status == "paid"
        assert second is not None and second.status == "paid"
        assert second.external_id == "ext-1"
    finally:
        db.query(PaymentOrder).filter(PaymentOrder.out_trade_no == out_trade_no).delete()
        db.query(User).filter(User.id == user_id).delete()
        db.commit()
        db.close()


@pytest.mark.requires_db
def test_complete_paid_order_skips_already_paid(monkeypatch):
    db = SessionLocal()
    user_id = uuid.uuid4()
    out_trade_no = f"test_{uuid.uuid4().hex}"
    fulfill_calls = {"count": 0}

    def fake_fulfill(*args, **kwargs):
        fulfill_calls["count"] += 1
        return {"credits_granted": 10, "balance": 10}

    monkeypatch.setattr("app.services.billing.fulfill_payment", fake_fulfill)

    try:
        user = User(
            id=user_id,
            email=f"pay2-{uuid.uuid4().hex[:8]}@test.local",
            username=f"payuser2_{uuid.uuid4().hex[:8]}",
            hashed_password="x",
        )
        db.add(user)
        db.commit()

        register_pending_order(
            db,
            user_id=user_id,
            pack_id="pack_10",
            channel="mock",
            out_trade_no=out_trade_no,
            amount_fen=1000,
        )
        first = complete_paid_order(db, out_trade_no, provider_tx_id="tx-1", source="mock")
        second = complete_paid_order(db, out_trade_no, provider_tx_id="tx-2", source="mock")

        assert first.get("fulfilled") is True
        assert second.get("skipped") == "already_paid"
        assert fulfill_calls["count"] == 1
    finally:
        db.query(PaymentOrder).filter(PaymentOrder.out_trade_no == out_trade_no).delete()
        db.query(User).filter(User.id == user_id).delete()
        db.commit()
        db.close()
