"""Payment webhook security tests."""

import uuid
from datetime import datetime, timedelta

import pytest

from app.database import SessionLocal
from app.models.schemas import PaymentOrder, User
from app.services.payment_orders import complete_paid_order, register_pending_order
from app.services.payment_security import (
    assert_order_payable,
    validate_alipay_notify_fields,
    validate_wechat_notify_fields,
)


@pytest.mark.requires_db
def test_complete_paid_order_rejects_expired():
    db = SessionLocal()
    user_id = uuid.uuid4()
    out_trade_no = f"expired_{uuid.uuid4().hex}"
    try:
        user = User(
            id=user_id,
            email=f"exp2-{uuid.uuid4().hex[:8]}@test.local",
            username=f"exp2_{uuid.uuid4().hex[:8]}",
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
            amount_fen=680,
        )
        row = db.query(PaymentOrder).filter(PaymentOrder.out_trade_no == out_trade_no).first()
        row.expires_at = datetime.utcnow() - timedelta(minutes=1)
        db.commit()

        result = complete_paid_order(db, out_trade_no, provider_tx_id="tx", source="mock")
        assert result.get("skipped") == "order_expired"
        db.refresh(row)
        assert row.status == "expired"
    finally:
        db.query(PaymentOrder).filter(PaymentOrder.out_trade_no == out_trade_no).delete()
        db.query(User).filter(User.id == user_id).delete()
        db.commit()
        db.close()


@pytest.mark.requires_db
def test_wechat_amount_mismatch_rejected():
    db = SessionLocal()
    user_id = uuid.uuid4()
    out_trade_no = f"wx_{uuid.uuid4().hex}"
    try:
        user = User(
            id=user_id,
            email=f"wx-{uuid.uuid4().hex[:8]}@test.local",
            username=f"wx_{uuid.uuid4().hex[:8]}",
            hashed_password="x",
        )
        db.add(user)
        db.commit()
        row = register_pending_order(
            db,
            user_id=user_id,
            pack_id="pack_10",
            channel="wechat_native",
            out_trade_no=out_trade_no,
            amount_fen=680,
        )
        err = validate_wechat_notify_fields({"total_fee": "999", "appid": "", "mch_id": ""}, row)
        assert err == "amount_mismatch"
    finally:
        db.query(PaymentOrder).filter(PaymentOrder.out_trade_no == out_trade_no).delete()
        db.query(User).filter(User.id == user_id).delete()
        db.commit()
        db.close()


@pytest.mark.requires_db
def test_alipay_amount_mismatch_rejected():
    db = SessionLocal()
    user_id = uuid.uuid4()
    out_trade_no = f"ali_{uuid.uuid4().hex}"
    try:
        user = User(
            id=user_id,
            email=f"ali-{uuid.uuid4().hex[:8]}@test.local",
            username=f"ali_{uuid.uuid4().hex[:8]}",
            hashed_password="x",
        )
        db.add(user)
        db.commit()
        row = register_pending_order(
            db,
            user_id=user_id,
            pack_id="pack_10",
            channel="alipay_web",
            out_trade_no=out_trade_no,
            amount_fen=680,
        )
        err = validate_alipay_notify_fields({"total_amount": "99.00", "app_id": ""}, row)
        assert err == "amount_mismatch"
    finally:
        db.query(PaymentOrder).filter(PaymentOrder.out_trade_no == out_trade_no).delete()
        db.query(User).filter(User.id == user_id).delete()
        db.commit()
        db.close()


def test_assert_order_payable_states():
    row = PaymentOrder(
        user_id=uuid.uuid4(),
        pack_id="pack_10",
        channel="mock",
        out_trade_no="x",
        amount_fen=100,
        status="paid",
    )
    assert assert_order_payable(row) == "already_paid"
    row.status = "expired"
    assert assert_order_payable(row) == "invalid_status:expired"
