"""Unified payment order lifecycle."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.config import settings
from app.models.schemas import PaymentOrder
from app.services.cache import cache_get, cache_set


def register_pending_order(
    db: Session,
    *,
    user_id: uuid.UUID,
    pack_id: str,
    channel: str,
    out_trade_no: str,
    amount_fen: int,
    payment_terms_version: str | None = None,
) -> PaymentOrder:
    ttl_hours = max(1, int(settings.payment_order_ttl_hours))
    row = PaymentOrder(
        user_id=user_id,
        pack_id=pack_id,
        channel=channel,
        out_trade_no=out_trade_no,
        amount_fen=amount_fen,
        status="pending",
        payment_terms_version=payment_terms_version,
        expires_at=datetime.utcnow() + timedelta(hours=ttl_hours),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    cache_set(
        f"payment_order:{out_trade_no}",
        {"user_id": str(user_id), "pack_id": pack_id, "channel": channel},
        7200,
    )
    return row


def get_order_status(db: Session, out_trade_no: str, user_id: uuid.UUID | None = None) -> dict[str, Any] | None:
    row = db.query(PaymentOrder).filter(PaymentOrder.out_trade_no == out_trade_no).first()
    if not row:
        return None
    if user_id and row.user_id != user_id:
        return None
    return {
        "out_trade_no": row.out_trade_no,
        "status": row.status,
        "channel": row.channel,
        "pack_id": row.pack_id,
        "paid_at": row.paid_at.isoformat() if row.paid_at else None,
    }


def list_user_orders(db: Session, user_id: uuid.UUID, *, limit: int = 20) -> list[dict[str, Any]]:
    from app.services.billing import product_label

    rows = (
        db.query(PaymentOrder)
        .filter(PaymentOrder.user_id == user_id)
        .order_by(PaymentOrder.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "out_trade_no": row.out_trade_no,
            "pack_id": row.pack_id,
            "label": product_label(row.pack_id),
            "channel": row.channel,
            "amount_fen": row.amount_fen,
            "amount_yuan": round(row.amount_fen / 100, 2),
            "status": row.status,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "paid_at": row.paid_at.isoformat() if row.paid_at else None,
            "payment_terms_version": row.payment_terms_version,
            "expires_at": row.expires_at.isoformat() if row.expires_at else None,
        }
        for row in rows
    ]


def expire_stale_pending_orders(db: Session, *, ttl_hours: int | None = None) -> int:
    """Mark pending orders past expires_at (or TTL) as expired."""
    now = datetime.utcnow()
    fallback = now - timedelta(hours=ttl_hours or max(1, int(settings.payment_order_ttl_hours)))
    rows = (
        db.query(PaymentOrder)
        .filter(
            PaymentOrder.status == "pending",
            or_(
                PaymentOrder.expires_at.isnot(None) & (PaymentOrder.expires_at <= now),
                PaymentOrder.expires_at.is_(None) & (PaymentOrder.created_at <= fallback),
            ),
        )
        .all()
    )
    for row in rows:
        row.status = "expired"
    if rows:
        db.commit()
    return len(rows)


def commercial_stats(db: Session, *, days: int = 30) -> dict[str, Any]:
    from sqlalchemy import func

    from app.models.schemas import CreditTransaction, UserSubscription

    since = datetime.utcnow() - timedelta(days=days)
    total_fen = (
        db.query(func.coalesce(func.sum(PaymentOrder.amount_fen), 0))
        .filter(PaymentOrder.status == "paid", PaymentOrder.paid_at >= since)
        .scalar()
    )
    paid_orders = (
        db.query(func.count(PaymentOrder.id))
        .filter(PaymentOrder.status == "paid", PaymentOrder.paid_at >= since)
        .scalar()
    )
    by_channel_rows = (
        db.query(PaymentOrder.channel, func.sum(PaymentOrder.amount_fen))
        .filter(PaymentOrder.status == "paid", PaymentOrder.paid_at >= since)
        .group_by(PaymentOrder.channel)
        .all()
    )
    by_channel: dict[str, int] = {}
    for channel, fen in by_channel_rows:
        ch = (channel or "unknown").split("_")[0]
        by_channel[ch] = by_channel.get(ch, 0) + int(fen or 0)

    credit_sales = (
        db.query(func.count(CreditTransaction.id))
        .filter(CreditTransaction.created_at >= since, CreditTransaction.credits > 0)
        .scalar()
    )
    active_subs = (
        db.query(func.count(UserSubscription.id))
        .filter(UserSubscription.status == "active")
        .scalar()
    )
    mrr_fen = 0
    subs = db.query(UserSubscription).filter(UserSubscription.status == "active").all()
    from app.services.billing import SUBSCRIPTION_PLANS, product_amount_fen

    for sub in subs:
        plan = SUBSCRIPTION_PLANS.get(sub.plan_id or "sub_monthly", SUBSCRIPTION_PLANS["sub_monthly"])
        monthly_fen = product_amount_fen(plan)
        if (plan.get("duration_days") or 30) > 31:
            monthly_fen = monthly_fen // 12
        mrr_fen += monthly_fen

    churned = (
        db.query(func.count(UserSubscription.id))
        .filter(UserSubscription.status == "inactive", UserSubscription.updated_at >= since)
        .scalar()
    )
    new_subs = (
        db.query(func.count(UserSubscription.id))
        .filter(UserSubscription.status == "active", UserSubscription.created_at >= since)
        .scalar()
    )
    avg_order_fen = int(total_fen / paid_orders) if paid_orders else 0

    return {
        "period_days": days,
        "paid_orders": int(paid_orders or 0),
        "revenue_fen": int(total_fen or 0),
        "revenue_yuan": round(int(total_fen or 0) / 100, 2),
        "revenue_by_channel_fen": by_channel,
        "credit_transactions": int(credit_sales or 0),
        "active_subscriptions": int(active_subs or 0),
        "mrr_fen": int(mrr_fen),
        "mrr_yuan": round(mrr_fen / 100, 2),
        "churned_subscriptions": int(churned or 0),
        "new_subscriptions": int(new_subs or 0),
        "avg_order_fen": avg_order_fen,
        "ltv_estimate_yuan": round((avg_order_fen / 100) * 3, 2),
        "member_monthly_credits_pool": int(
            db.query(func.coalesce(func.sum(UserSubscription.monthly_credits), 0))
            .filter(UserSubscription.status == "active")
            .scalar()
            or 0
        ),
    }


def mark_order_paid(db: Session, out_trade_no: str, external_id: str) -> PaymentOrder | None:
    row = db.query(PaymentOrder).filter(PaymentOrder.out_trade_no == out_trade_no).first()
    if not row:
        return None
    if row.status == "paid":
        return row
    row.status = "paid"
    row.external_id = external_id
    row.paid_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return row


def complete_paid_order(
    db: Session,
    out_trade_no: str,
    *,
    provider_tx_id: str | None = None,
    source: str,
) -> dict[str, Any]:
    """Idempotent fulfillment: skip if already paid; dedupe by out_trade_no."""
    from app.services.billing import fulfill_payment
    from app.services.payment_security import assert_order_payable

    row = (
        db.query(PaymentOrder)
        .filter(PaymentOrder.out_trade_no == out_trade_no)
        .with_for_update()
        .first()
    )
    if not row:
        return {"skipped": "order_not_found"}

    skip = assert_order_payable(row)
    if skip == "order_expired":
        row.status = "expired"
        db.commit()
        return {"skipped": skip}
    if skip:
        return {"skipped": skip}

    result = fulfill_payment(
        db,
        row.user_id,
        row.pack_id,
        source=source,
        external_id=out_trade_no,
    )
    row.status = "paid"
    row.external_id = provider_tx_id or out_trade_no
    row.paid_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return {"fulfilled": True, **result}


async def stripe_refund_for_order(order: PaymentOrder) -> dict[str, Any]:
    """Best-effort Stripe refund for a paid order (checkout session → payment_intent)."""
    from app.config import settings

    if order.channel != "stripe" or order.status != "paid" or not settings.stripe_secret_key:
        return {"skipped": "not_eligible"}
    session_id = order.external_id or ""
    if not session_id.startswith("cs_"):
        return {"skipped": "no_checkout_session"}

    import httpx

    async with httpx.AsyncClient(timeout=30.0) as client:
        session_resp = await client.get(
            f"https://api.stripe.com/v1/checkout/sessions/{session_id}",
            auth=(settings.stripe_secret_key, ""),
        )
        if session_resp.status_code >= 400:
            return {"error": "session_lookup_failed"}
        payment_intent = session_resp.json().get("payment_intent")
        if not payment_intent:
            return {"skipped": "no_payment_intent"}
        refund_resp = await client.post(
            "https://api.stripe.com/v1/refunds",
            data={"payment_intent": payment_intent},
            auth=(settings.stripe_secret_key, ""),
        )
        if refund_resp.status_code >= 400:
            return {"error": refund_resp.text[:200]}
        refund_id = refund_resp.json().get("id")
        return {"refund_id": refund_id, "payment_intent": payment_intent}
