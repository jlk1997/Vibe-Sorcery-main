"""Commercial billing tests — payment terms audit & subscription cancel."""

import asyncio
import uuid

import pytest

from app.database import SessionLocal
from app.models.schemas import PaymentOrder, User, UserConsentLog, UserSubscription
from app.services.legal import get_current_versions, record_payment_terms_consent
from app.services.payment_orders import expire_stale_pending_orders, register_pending_order
from app.services.subscriptions import cancel_subscription, get_user_subscription


@pytest.mark.requires_db
def test_register_pending_order_stores_payment_terms():
    db = SessionLocal()
    user_id = uuid.uuid4()
    out_trade_no = f"terms_{uuid.uuid4().hex}"
    try:
        user = User(
            id=user_id,
            email=f"terms-{uuid.uuid4().hex[:8]}@test.local",
            username=f"terms_{uuid.uuid4().hex[:8]}",
            hashed_password="x",
        )
        db.add(user)
        db.commit()

        payment_version = get_current_versions()["payment-terms"]
        row = register_pending_order(
            db,
            user_id=user_id,
            pack_id="pack_10",
            channel="mock",
            out_trade_no=out_trade_no,
            amount_fen=680,
            payment_terms_version=payment_version,
        )
        assert row.payment_terms_version == payment_version
        assert row.expires_at is not None
    finally:
        db.query(PaymentOrder).filter(PaymentOrder.out_trade_no == out_trade_no).delete()
        db.query(User).filter(User.id == user_id).delete()
        db.commit()
        db.close()


@pytest.mark.requires_db
def test_cancel_subscription_at_period_end():
    db = SessionLocal()
    user_id = uuid.uuid4()
    try:
        user = User(
            id=user_id,
            email=f"sub-{uuid.uuid4().hex[:8]}@test.local",
            username=f"sub_{uuid.uuid4().hex[:8]}",
            hashed_password="x",
        )
        db.add(user)
        sub = UserSubscription(
            user_id=user_id,
            tier="member",
            status="active",
            plan_id="sub_monthly",
            channel="mock",
            monthly_credits=30,
        )
        db.add(sub)
        db.commit()

        result = asyncio.run(cancel_subscription(db, user_id, immediate=False))
        assert result["cancelled"] is True
        refreshed = get_user_subscription(db, user_id)
        assert refreshed is not None
        assert refreshed.cancel_at_period_end is True
        assert refreshed.status == "active"
    finally:
        db.query(UserSubscription).filter(UserSubscription.user_id == user_id).delete()
        db.query(User).filter(User.id == user_id).delete()
        db.commit()
        db.close()


@pytest.mark.requires_db
def test_record_payment_terms_consent_logs():
    db = SessionLocal()
    user_id = uuid.uuid4()
    try:
        user = User(
            id=user_id,
            email=f"consent-{uuid.uuid4().hex[:8]}@test.local",
            username=f"consent_{uuid.uuid4().hex[:8]}",
            hashed_password="x",
        )
        db.add(user)
        db.commit()

        payment_version = get_current_versions()["payment-terms"]
        record_payment_terms_consent(db, user, payment_version)
        db.commit()
        log = (
            db.query(UserConsentLog)
            .filter(UserConsentLog.user_id == user_id, UserConsentLog.consent_type == "payment_terms")
            .first()
        )
        assert log is not None
        assert log.version == payment_version
    finally:
        db.query(UserConsentLog).filter(UserConsentLog.user_id == user_id).delete()
        db.query(User).filter(User.id == user_id).delete()
        db.commit()
        db.close()


@pytest.mark.requires_db
def test_expire_stale_pending_orders():
    db = SessionLocal()
    user_id = uuid.uuid4()
    out_trade_no = f"exp_{uuid.uuid4().hex}"
    try:
        from datetime import datetime, timedelta

        user = User(
            id=user_id,
            email=f"exp-{uuid.uuid4().hex[:8]}@test.local",
            username=f"exp_{uuid.uuid4().hex[:8]}",
            hashed_password="x",
        )
        db.add(user)
        db.commit()

        row = register_pending_order(
            db,
            user_id=user_id,
            pack_id="pack_10",
            channel="mock",
            out_trade_no=out_trade_no,
            amount_fen=680,
        )
        row.expires_at = datetime.utcnow() - timedelta(minutes=5)
        db.commit()

        count = expire_stale_pending_orders(db)
        assert count >= 1
        db.refresh(row)
        assert row.status == "expired"
    finally:
        db.query(PaymentOrder).filter(PaymentOrder.out_trade_no == out_trade_no).delete()
        db.query(User).filter(User.id == user_id).delete()
        db.commit()
        db.close()
