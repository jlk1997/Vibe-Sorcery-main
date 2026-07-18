"""Subscription lifecycle — Stripe webhooks + mock renewal cron."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.models.schemas import CreditTransaction, User, UserSubscription
from app.services.credits import grant_credits_with_transaction


def _provision_workspace_from_plan(db: Session, user_id: uuid.UUID, plan_id: str) -> str | None:
    """Auto-provision tenant workspace when purchasing Team or API Starter plans."""
    if plan_id not in ("sub_team", "sub_api_starter"):
        return None
    from app.services.billing import SUBSCRIPTION_PLANS
    from app.services.tenant import get_or_create_tenant

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return None
    tenant_id = user.tenant_id
    if not tenant_id or tenant_id == settings.default_tenant_id:
        tenant_id = f"team-{str(user_id).replace('-', '')[:10]}"
        user.tenant_id = tenant_id
        user.is_tenant_admin = True
    plan = SUBSCRIPTION_PLANS.get(plan_id, {})
    tenant = get_or_create_tenant(db, tenant_id, name=f"{user.username or 'Team'} Workspace")
    tenant.plan = "team" if plan_id == "sub_team" else "api"
    if plan_id == "sub_team":
        tenant.credit_pool = (tenant.credit_pool or 0) + int(plan.get("monthly_credits") or 100)
    db.flush()
    return tenant_id


def subscription_to_dict(sub: UserSubscription | None) -> dict[str, Any]:
    if not sub:
        return {
            "tier": "free",
            "status": "inactive",
            "plan_id": None,
            "channel": None,
            "monthly_credits": 0,
            "renews_at": None,
            "cancel_at_period_end": False,
            "days_remaining": None,
            "perks": {"priority_queue": False, "exclusive_presets": False},
            "can_manage_stripe": False,
        }
    active = sub.status == "active"
    days_remaining = None
    if sub.renews_at:
        delta = (sub.renews_at.date() - datetime.utcnow().date()).days
        days_remaining = max(0, delta)
    return {
        "tier": sub.tier,
        "status": sub.status,
        "plan_id": sub.plan_id,
        "channel": sub.channel,
        "monthly_credits": sub.monthly_credits,
        "renews_at": sub.renews_at.isoformat() if sub.renews_at else None,
        "cancel_at_period_end": bool(sub.cancel_at_period_end),
        "days_remaining": days_remaining,
        "perks": {
            "priority_queue": active,
            "exclusive_presets": active,
        },
        "can_manage_stripe": bool(sub.stripe_subscription_id and sub.stripe_customer_id),
    }


def is_active_subscriber(db: Session, user_id: uuid.UUID) -> bool:
    sub = get_user_subscription(db, user_id)
    return sub is not None and sub.status == "active"


def get_user_subscription(db: Session, user_id: uuid.UUID) -> UserSubscription | None:
    return db.query(UserSubscription).filter(UserSubscription.user_id == user_id).first()


def _grant_subscription_credits(
    db: Session,
    user_id: uuid.UUID,
    credits: int,
    *,
    source: str,
    external_id: str,
    pack_id: str,
) -> dict[str, Any] | None:
    existing = (
        db.query(CreditTransaction)
        .filter(CreditTransaction.external_id == external_id)
        .first()
    )
    if existing:
        from app.services.credits import get_or_create_credits

        row = get_or_create_credits(db, user_id)
        return {"duplicate": True, "balance": row.balance, "credits_granted": existing.credits}

    row = grant_credits_with_transaction(
        db,
        user_id,
        credits,
        source=source,
        external_id=external_id,
        pack_id=pack_id,
        commit=False,
    )
    return {"credits_granted": credits, "balance": row.balance}


def activate_subscription_from_payment(
    db: Session,
    user_id: uuid.UUID,
    plan_id: str,
    *,
    source: str,
    external_id: str | None,
    channel: str | None = None,
) -> dict[str, Any]:
    from app.services.billing import SUBSCRIPTION_PLANS, product_amount_fen

    plan = SUBSCRIPTION_PLANS.get(plan_id)
    if not plan:
        raise HTTPException(status_code=400, detail="Unknown subscription plan")

    dedupe_id = external_id or f"{plan_id}_{user_id}"
    existing = (
        db.query(CreditTransaction)
        .filter(CreditTransaction.external_id == dedupe_id)
        .first()
    )
    if existing:
        from app.services.credits import get_or_create_credits

        row = get_or_create_credits(db, user_id)
        sub = get_user_subscription(db, user_id)
        return {
            "duplicate": True,
            "tier": sub.tier if sub else "member",
            "credits_granted": existing.credits,
            "balance": row.balance,
            "subscription": subscription_to_dict(sub),
        }

    monthly = int(plan.get("monthly_credits") or settings.subscription_monthly_credits)
    duration = int(plan.get("duration_days") or 30)
    grant_credits = int(plan.get("upfront_credits") or monthly)

    sub = get_user_subscription(db, user_id)
    if not sub:
        sub = UserSubscription(user_id=user_id)
        db.add(sub)
    sub.tier = "member"
    sub.status = "active"
    sub.plan_id = plan_id
    sub.channel = channel or source.split("_")[0]
    sub.monthly_credits = monthly
    sub.cancel_at_period_end = False
    sub.renews_at = datetime.utcnow() + timedelta(days=duration)
    db.flush()

    credit_result = _grant_subscription_credits(
        db,
        user_id,
        grant_credits,
        source=source,
        external_id=dedupe_id,
        pack_id=plan_id,
    )
    db.commit()
    db.refresh(sub)

    _provision_workspace_from_plan(db, user_id, plan_id)

    try:
        from app.services.analytics import track_event

        track_event(
            db,
            "subscription_purchase",
            user_id=user_id,
            payload={
                "plan_id": plan_id,
                "amount_fen": product_amount_fen(plan),
                "source": source,
            },
        )
    except Exception:
        pass

    return {
        "tier": sub.tier,
        "credits_granted": credit_result.get("credits_granted", grant_credits) if credit_result else grant_credits,
        "balance": credit_result.get("balance") if credit_result else None,
        "subscription": subscription_to_dict(sub),
    }


def activate_subscription_from_checkout(db: Session, session: dict[str, Any]) -> dict[str, Any]:
    metadata = session.get("metadata") or {}
    user_id_raw = metadata.get("user_id") or session.get("client_reference_id")
    if not user_id_raw:
        return {"skipped": "missing user_id"}

    user_id = uuid.UUID(str(user_id_raw))
    plan_id = str(metadata.get("plan_id") or "sub_monthly")
    from app.services.billing import SUBSCRIPTION_PLANS

    plan = SUBSCRIPTION_PLANS.get(plan_id) or SUBSCRIPTION_PLANS["sub_monthly"]
    stripe_sub_id = session.get("subscription")
    monthly = int(plan.get("monthly_credits") or settings.subscription_monthly_credits)
    duration_days = int(plan.get("duration_days") or 30)
    grant_credits = int(plan.get("upfront_credits") or monthly)

    sub = get_user_subscription(db, user_id)
    if not sub:
        sub = UserSubscription(user_id=user_id)
        db.add(sub)

    sub.tier = "member"
    sub.status = "active"
    sub.plan_id = plan_id
    sub.channel = "stripe"
    sub.monthly_credits = monthly
    sub.cancel_at_period_end = False
    sub.stripe_subscription_id = str(stripe_sub_id) if stripe_sub_id else sub.stripe_subscription_id
    customer_id = session.get("customer")
    if customer_id:
        sub.stripe_customer_id = str(customer_id)
    sub.renews_at = datetime.utcnow() + timedelta(days=duration_days)
    credit_result = _grant_subscription_credits(
        db,
        user_id,
        grant_credits,
        source="stripe_subscription",
        external_id=f"checkout_{session.get('id')}",
        pack_id=plan_id,
    )
    db.commit()
    db.refresh(sub)

    return {
        "activated": True,
        "credits_granted": credit_result.get("credits_granted", grant_credits) if credit_result else grant_credits,
        **subscription_to_dict(sub),
    }


def grant_subscription_invoice(db: Session, invoice: dict[str, Any]) -> dict[str, Any]:
    invoice_id = invoice.get("id")
    stripe_sub_id = invoice.get("subscription")
    if not invoice_id or not stripe_sub_id:
        return {"skipped": "not a subscription invoice"}

    sub = (
        db.query(UserSubscription)
        .filter(UserSubscription.stripe_subscription_id == str(stripe_sub_id))
        .first()
    )
    if not sub or sub.status != "active":
        return {"skipped": "no active subscription"}

    credits = sub.monthly_credits or settings.subscription_monthly_credits
    result = _grant_subscription_credits(
        db,
        sub.user_id,
        credits,
        source="stripe_subscription",
        external_id=str(invoice_id),
        pack_id="subscription_renewal",
    )
    if result and not result.get("duplicate"):
        sub.renews_at = datetime.utcnow() + timedelta(days=30)
    db.commit()
    return result or {"skipped": "already granted"}


def sync_stripe_subscription_status(db: Session, stripe_sub: dict[str, Any]) -> dict[str, Any]:
    stripe_sub_id = stripe_sub.get("id")
    if not stripe_sub_id:
        return {"skipped": "missing subscription id"}

    sub = (
        db.query(UserSubscription)
        .filter(UserSubscription.stripe_subscription_id == str(stripe_sub_id))
        .first()
    )
    if not sub:
        return {"skipped": "subscription not found"}

    status = stripe_sub.get("status", "inactive")
    if status in ("active", "trialing"):
        sub.status = "active"
    elif status in ("canceled", "unpaid", "past_due", "incomplete_expired"):
        sub.status = "inactive"
        sub.tier = "free"
    db.commit()
    return {"synced": True, "status": sub.status}


def process_mock_subscription_renewals(db: Session) -> int:
    """Grant monthly credits for mock subscriptions whose renews_at has passed."""
    now = datetime.utcnow()
    subs = (
        db.query(UserSubscription)
        .filter(
            UserSubscription.status == "active",
            UserSubscription.stripe_subscription_id.is_(None),
            UserSubscription.renews_at.isnot(None),
            UserSubscription.renews_at <= now,
        )
        .all()
    )
    count = 0
    for sub in subs:
        if sub.cancel_at_period_end:
            sub.status = "inactive"
            sub.tier = "free"
            db.commit()
            continue
        period_key = sub.renews_at.strftime("%Y-%m") if sub.renews_at else now.strftime("%Y-%m")
        external_id = f"mock_sub_{sub.user_id}_{period_key}"
        credits = sub.monthly_credits or settings.subscription_monthly_credits
        result = _grant_subscription_credits(
            db,
            sub.user_id,
            credits,
            source="subscription_renewal",
            external_id=external_id,
            pack_id="subscription_renewal",
        )
        if result and not result.get("duplicate"):
            count += 1
        sub.renews_at = now + timedelta(days=30)
    if subs:
        db.commit()
    return count


def remind_subscription_expiry(db: Session, *, days_before: int = 3) -> int:
    """Notify CN-style (non-Stripe) members before renews_at."""
    from app.models.schemas import Notification
    from app.services.notifications import create_notification

    now = datetime.utcnow()
    window_end = now + timedelta(days=days_before)
    subs = (
        db.query(UserSubscription)
        .filter(
            UserSubscription.status == "active",
            UserSubscription.stripe_subscription_id.is_(None),
            UserSubscription.renews_at.isnot(None),
            UserSubscription.renews_at > now,
            UserSubscription.renews_at <= window_end,
        )
        .all()
    )
    sent = 0
    for sub in subs:
        if not sub.renews_at:
            continue
        days_left = max(1, (sub.renews_at.date() - now.date()).days)
        dedupe_key = sub.renews_at.strftime("%Y-%m-%d")
        existing = (
            db.query(Notification)
            .filter(
                Notification.user_id == sub.user_id,
                Notification.type == "subscription_expiring",
            )
            .all()
        )
        if any((n.payload or {}).get("dedupe_key") == dedupe_key for n in existing):
            continue
        create_notification(
            db,
            sub.user_id,
            "subscription_expiring",
            {
                "days": days_left,
                "renews_at": sub.renews_at.isoformat(),
                "dedupe_key": dedupe_key,
                "message": f"Membership expires in {days_left} days",
            },
        )
        sent += 1
    return sent


async def cancel_subscription(
    db: Session,
    user_id: uuid.UUID,
    *,
    immediate: bool = False,
) -> dict[str, Any]:
    """Cancel membership — Stripe uses API; CN/mock cancels at period end by default."""
    import httpx

    sub = get_user_subscription(db, user_id)
    if not sub or sub.status != "active":
        raise HTTPException(status_code=400, detail="No active subscription")

    if sub.stripe_subscription_id and settings.stripe_secret_key:
        async with httpx.AsyncClient(timeout=30) as client:
            if immediate:
                resp = await client.delete(
                    f"https://api.stripe.com/v1/subscriptions/{sub.stripe_subscription_id}",
                    auth=(settings.stripe_secret_key, ""),
                )
            else:
                resp = await client.post(
                    f"https://api.stripe.com/v1/subscriptions/{sub.stripe_subscription_id}",
                    data={"cancel_at_period_end": "true"},
                    auth=(settings.stripe_secret_key, ""),
                )
        if resp.status_code >= 400:
            raise HTTPException(status_code=502, detail="Stripe subscription cancel failed")

        stripe_data = resp.json()
        if immediate or stripe_data.get("status") == "canceled":
            sub.status = "inactive"
            sub.tier = "free"
            sub.cancel_at_period_end = False
        else:
            sub.cancel_at_period_end = True
        db.commit()
        db.refresh(sub)
        return {"cancelled": True, "subscription": subscription_to_dict(sub)}

    if immediate:
        sub.status = "inactive"
        sub.tier = "free"
        sub.cancel_at_period_end = False
    else:
        sub.cancel_at_period_end = True
    db.commit()
    db.refresh(sub)
    return {"cancelled": True, "subscription": subscription_to_dict(sub)}


async def create_stripe_billing_portal(db: Session, user: User) -> dict[str, Any]:
    """Stripe Customer Portal for invoices & payment method management."""
    import httpx

    if not settings.stripe_secret_key:
        raise HTTPException(status_code=503, detail="Stripe billing portal not configured")

    sub = get_user_subscription(db, user.id)
    customer_id = sub.stripe_customer_id if sub else None
    if not customer_id:
        raise HTTPException(status_code=400, detail="No Stripe billing profile — subscribe via Stripe first")

    payload = {
        "customer": customer_id,
        "return_url": settings.frontend_page("/pages/pricing/index"),
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.stripe.com/v1/billing_portal/sessions",
            data=payload,
            auth=(settings.stripe_secret_key, ""),
        )
    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail="Stripe portal session failed")
    data = resp.json()
    return {"url": data.get("url")}


def deactivate_expired_subscriptions(db: Session) -> int:
    """Expire active subs past renews_at when set to cancel at period end."""
    now = datetime.utcnow()
    subs = (
        db.query(UserSubscription)
        .filter(
            UserSubscription.status == "active",
            UserSubscription.renews_at.isnot(None),
            UserSubscription.renews_at <= now,
            UserSubscription.cancel_at_period_end.is_(True),
        )
        .all()
    )
    for sub in subs:
        sub.status = "inactive"
        sub.tier = "free"
        sub.cancel_at_period_end = False
    if subs:
        db.commit()
    return len(subs)


def remind_expiring_subscriptions(db: Session, *, days_before: int = 3) -> int:
    """In-app reminder before subscription renews_at."""
    now = datetime.utcnow()
    window_end = now + timedelta(days=days_before)
    subs = (
        db.query(UserSubscription)
        .filter(
            UserSubscription.status == "active",
            UserSubscription.renews_at.isnot(None),
            UserSubscription.renews_at > now,
            UserSubscription.renews_at <= window_end,
        )
        .all()
    )
    if not subs:
        return 0
    from app.models.schemas import Notification
    from app.services.notifications import create_notification

    sent = 0
    for sub in subs:
        exists = (
            db.query(Notification.id)
            .filter(
                Notification.user_id == sub.user_id,
                Notification.type == "subscription_expiring",
                Notification.created_at >= now - timedelta(days=days_before + 1),
            )
            .first()
        )
        if exists:
            continue
        days_left = max(1, int((sub.renews_at - now).total_seconds() / 86400))
        create_notification(
            db,
            sub.user_id,
            "subscription_expiring",
            {"days_left": days_left, "renews_at": sub.renews_at.isoformat() if sub.renews_at else None},
        )
        sent += 1
    return sent
