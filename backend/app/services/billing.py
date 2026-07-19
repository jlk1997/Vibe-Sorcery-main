"""Stripe / mock billing for credit packs."""

from __future__ import annotations

import hashlib
import hmac
import json
import time
import uuid
from typing import Any

import httpx
from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.config import settings
from app.models.schemas import CreditTransaction, User
from app.services.credits import add_credits, grant_credits_with_transaction

CREDIT_PACKS: dict[str, dict[str, Any]] = {
    "pack_10": {"credits": 10, "amount_cents": 999, "amount_fen": 1, "label": "10 次创作额度"},
    "pack_50": {"credits": 50, "amount_cents": 3999, "amount_fen": 2800, "label": "50 次创作额度"},
    "pack_100": {"credits": 100, "amount_cents": 6999, "amount_fen": 4800, "label": "100 次创作额度"},
    "duel_season_pass": {
        "credits": 0,
        "duel_starts": 10,
        "amount_cents": 199,
        "amount_fen": 1200,
        "label": "决斗季卡",
        "description": "10 次免费发起情绪决斗",
        "type": "duel_pass",
    },
}

SUBSCRIPTION_PLANS: dict[str, dict[str, Any]] = {
    "sub_monthly": {
        "type": "subscription",
        "label": "会员月卡",
        "amount_cents": 499,
        "amount_fen": 2900,
        "monthly_credits": 30,
        "duration_days": 30,
        "description": "每月 30 次创作额度 · 优先队列 · 专属场景模板",
    },
    "sub_yearly": {
        "type": "subscription",
        "label": "会员年卡",
        "amount_cents": 4999,
        "amount_fen": 26800,
        "monthly_credits": 30,
        "duration_days": 365,
        "description": "全年会员 · 开通即赠 360 额度 · 约 8 折",
        "upfront_credits": 360,
    },
    "sub_pro_commercial": {
        "type": "subscription",
        "label": "Pro 商用",
        "amount_cents": 1499,
        "amount_fen": 9900,
        "monthly_credits": 50,
        "duration_days": 30,
        "description": "无限 HQ 导出 · 商用证书 · API 500 次/月",
    },
    "sub_team": {
        "type": "subscription",
        "label": "团队版",
        "amount_cents": 2999,
        "amount_fen": 19900,
        "monthly_credits": 100,
        "duration_days": 30,
        "description": "5 席位共享额度池 · 协作管理后台",
        "seats": 5,
    },
    "sub_api_starter": {
        "type": "subscription",
        "label": "API Starter",
        "amount_cents": 2999,
        "amount_fen": 19900,
        "monthly_credits": 0,
        "duration_days": 30,
        "description": "1000 次/月 API · Webhook · 开发者集成",
        "api_quota": 1000,
    },
}


def get_product(product_id: str) -> dict[str, Any] | None:
    if product_id in CREDIT_PACKS:
        return {"id": product_id, "type": "credits", **CREDIT_PACKS[product_id]}
    if product_id in SUBSCRIPTION_PLANS:
        return {"id": product_id, **SUBSCRIPTION_PLANS[product_id]}
    return None


def product_amount_fen(product: dict[str, Any]) -> int:
    return int(product.get("amount_fen") or product["amount_cents"])


def product_label(product_id: str) -> str:
    product = get_product(product_id)
    return product["label"] if product else product_id


def is_subscription_product(product_id: str) -> bool:
    return product_id in SUBSCRIPTION_PLANS


# 微信「虚拟支付-道具直购」道具ID 映射。
#
# 你在小程序后台「虚拟支付 -> 道具管理」为每个商品创建道具后，把返回的 productId
# 填到这里（键=我们自己的商品ID，值=微信道具ID）。留空则回退用商品ID本身占位，
# 此时沙箱/现网会因找不到道具而下单失败——这是预期的，配好后即通。
#
# 重要：道具在后台配置的价格(单位:分)必须与本商品的 amount_fen 完全一致，
# 否则微信会因金额不符拒绝下单。
WECHAT_VPAY_GOODS: dict[str, str] = {
    "pack_10": "",
    "pack_50": "",
    "pack_100": "",
    "duel_season_pass": "",
    "sub_monthly": "",
    "sub_yearly": "",
    "sub_pro_commercial": "",
    "sub_team": "",
    "sub_api_starter": "",
}


def wechat_vpay_product_id(product_id: str) -> str:
    """返回该商品对应的微信道具ID。

    优先级：.env 的 WECHAT_VPAY_GOODS_JSON > 代码内 WECHAT_VPAY_GOODS > 回退商品ID本身。
    """
    env_map = settings.wechat_vpay_goods_map
    return env_map.get(product_id) or WECHAT_VPAY_GOODS.get(product_id) or product_id


def all_purchasable_products() -> dict[str, dict[str, Any]]:
    """所有可购买商品（额度包 + 会员套餐），用于配置校验/对账。"""
    merged: dict[str, dict[str, Any]] = {}
    for pid in list(CREDIT_PACKS.keys()) + list(SUBSCRIPTION_PLANS.keys()):
        p = get_product(pid)
        if p:
            merged[pid] = p
    return merged


def vpay_goods_report() -> list[dict[str, Any]]:
    """列出每个商品的道具映射状态与应配置的价格（分），供后台配置对照。"""
    report: list[dict[str, Any]] = []
    for pid, product in all_purchasable_products().items():
        mapped = wechat_vpay_product_id(pid)
        report.append(
            {
                "product_id": pid,
                "label": product.get("label", pid),
                "amount_fen": product_amount_fen(product),
                "wechat_product_id": mapped,
                "configured": mapped != pid,
            }
        )
    return report


def list_plans() -> list[dict[str, Any]]:
    return [
        {
            "id": pid,
            **plan,
            "price_cny_yuan": round(product_amount_fen(plan) / 100, 2),
            "wechat_enabled": settings.wechat_pay_enabled,
            "alipay_enabled": settings.alipay_enabled,
            "stripe_enabled": bool(settings.stripe_secret_key),
        }
        for pid, plan in SUBSCRIPTION_PLANS.items()
    ]


def list_packs() -> list[dict[str, Any]]:
    return [
        {
            "id": pid,
            **pack,
            "currency_usd": "usd",
            "currency_cny": "cny",
            "price_cny_yuan": round((pack.get("amount_fen") or pack["amount_cents"]) / 100, 2),
            "stripe_enabled": bool(settings.stripe_secret_key),
            "wechat_enabled": settings.wechat_pay_enabled,
            "alipay_enabled": settings.alipay_enabled,
        }
        for pid, pack in CREDIT_PACKS.items()
    ]


def list_payment_methods() -> dict[str, Any]:
    mock = not (settings.stripe_secret_key or settings.wechat_pay_enabled or settings.alipay_enabled)
    return {
        "mock_mode": mock,
        "channels": [
            {
                "id": "wechat",
                "label": "微信支付",
                "enabled": settings.wechat_pay_enabled or mock,
                "scenes": [
                    {"id": "native", "label": "扫码支付", "for": "web"},
                    {"id": "jsapi", "label": "小程序支付", "for": "miniprogram"},
                    {"id": "h5", "label": "H5 支付", "for": "mobile_web"},
                ],
            },
            {
                "id": "alipay",
                "label": "支付宝",
                "enabled": settings.alipay_enabled or mock,
                "scenes": [
                    {"id": "web", "label": "电脑网站支付", "for": "web"},
                    {"id": "h5", "label": "手机网站支付", "for": "mobile_web"},
                ],
            },
            {
                "id": "stripe",
                "label": "Stripe（国际卡）",
                "enabled": bool(settings.stripe_secret_key) or mock,
                "scenes": [{"id": "checkout", "label": "信用卡", "for": "web"}],
            },
        ],
    }


def _success_url() -> str:
    return settings.frontend_page("/pages/settings/index", checkout="success")


def _cancel_url() -> str:
    return settings.frontend_page("/pages/settings/index", checkout="cancel")


def create_mock_checkout(db: Session, user: User, pack_id: str) -> dict[str, Any]:
    """Dev fallback when Stripe is not configured — grants credits immediately."""
    if not settings.payment_mock_allowed:
        raise HTTPException(status_code=503, detail="支付未配置，请联系管理员")
    if not get_product(pack_id):
        raise HTTPException(status_code=400, detail="Unknown product_id")
    mock_id = f"mock_{uuid.uuid4().hex}"
    result = fulfill_payment(db, user.id, pack_id, source="mock", external_id=mock_id)
    return {
        "mode": "mock",
        "pack_id": pack_id,
        **result,
        "url": _success_url() + ("&sub=1" if is_subscription_product(pack_id) else ""),
    }


async def create_stripe_checkout(db: Session, user: User, pack_id: str) -> dict[str, Any]:
    product = get_product(pack_id)
    if not product:
        raise HTTPException(status_code=400, detail="Unknown pack_id")
    if product.get("type") != "credits" and not is_subscription_product(pack_id):
        raise HTTPException(status_code=400, detail="Unknown pack_id")
    if not settings.stripe_secret_key:
        return create_mock_checkout(db, user, pack_id)

    pack = product
    credits_meta = pack.get("credits") or pack.get("upfront_credits") or pack.get("monthly_credits") or 0

    payload = {
        "mode": "payment",
        "success_url": _success_url() + ("&sub=1" if is_subscription_product(pack_id) else ""),
        "cancel_url": _cancel_url(),
        "client_reference_id": str(user.id),
        "metadata[user_id]": str(user.id),
        "metadata[pack_id]": pack_id,
        "metadata[credits]": str(credits_meta),
        "line_items[0][price_data][currency]": "usd",
        "line_items[0][price_data][unit_amount]": str(pack["amount_cents"]),
        "line_items[0][price_data][product_data][name]": pack["label"],
        "line_items[0][quantity]": "1",
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.stripe.com/v1/checkout/sessions",
            data=payload,
            auth=(settings.stripe_secret_key, ""),
        )
    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail="Stripe checkout failed")
    data = resp.json()
    return {"mode": "stripe", "session_id": data.get("id"), "url": data.get("url")}


def fulfill_checkout(
    db: Session,
    user_id: uuid.UUID,
    pack_id: str,
    *,
    source: str = "stripe",
    stripe_session_id: str | None = None,
    external_id: str | None = None,
) -> dict[str, Any]:
    dedupe_id = external_id or stripe_session_id
    if dedupe_id:
        existing = (
            db.query(CreditTransaction)
            .filter(
                or_(
                    CreditTransaction.external_id == dedupe_id,
                    CreditTransaction.stripe_session_id == dedupe_id,
                )
            )
            .first()
        )
        if existing:
            from app.services.credits import get_or_create_credits

            row = get_or_create_credits(db, user_id)
            return {
                "credits_granted": existing.credits,
                "balance": row.balance,
                "duplicate": True,
            }

    if stripe_session_id:
        existing = (
            db.query(CreditTransaction)
            .filter(CreditTransaction.stripe_session_id == stripe_session_id)
            .first()
        )
        if existing:
            from app.services.credits import get_or_create_credits

            row = get_or_create_credits(db, user_id)
            return {
                "credits_granted": existing.credits,
                "balance": row.balance,
                "duplicate": True,
            }

    pack = CREDIT_PACKS.get(pack_id)
    if not pack:
        raise HTTPException(status_code=400, detail="Unknown pack_id")

    row = grant_credits_with_transaction(
        db,
        user_id,
        pack["credits"],
        source=source,
        external_id=external_id or stripe_session_id,
        pack_id=pack_id,
    )
    if stripe_session_id:
        tx = (
            db.query(CreditTransaction)
            .filter(CreditTransaction.external_id == (external_id or stripe_session_id))
            .order_by(CreditTransaction.created_at.desc())
            .first()
        )
        if tx and not tx.stripe_session_id:
            tx.stripe_session_id = stripe_session_id
            db.commit()
    _track_purchase(db, user_id, pack_id, pack["credits"], source)
    return {"credits_granted": pack["credits"], "balance": row.balance}


def fulfill_payment(
    db: Session,
    user_id: uuid.UUID,
    product_id: str,
    *,
    source: str = "stripe",
    stripe_session_id: str | None = None,
    external_id: str | None = None,
) -> dict[str, Any]:
    """Route credit packs vs subscription plans to the correct fulfillment handler."""
    if is_subscription_product(product_id):
        from app.services.subscriptions import activate_subscription_from_payment

        return activate_subscription_from_payment(
            db,
            user_id,
            product_id,
            source=source,
            external_id=external_id or stripe_session_id,
            channel=source.split("_")[0] if source else None,
        )
    pack = CREDIT_PACKS.get(product_id)
    if pack and pack.get("type") == "duel_pass":
        from app.services.duels import grant_duel_pass_starts

        starts = int(pack.get("duel_starts") or 10)
        grant_duel_pass_starts(db, user_id, starts=starts)
        _track_purchase(db, user_id, product_id, 0, source)
        return {"duel_starts_granted": starts, "product_id": product_id}
    return fulfill_checkout(
        db,
        user_id,
        product_id,
        source=source,
        stripe_session_id=stripe_session_id,
        external_id=external_id,
    )


def _track_purchase(db: Session, user_id: uuid.UUID, product_id: str, credits: int, source: str) -> None:
    try:
        from app.services.analytics import track_event

        track_event(
            db,
            "credit_purchase",
            user_id=user_id,
            payload={"product_id": product_id, "credits": credits, "source": source},
        )
    except Exception:
        pass


async def create_subscription_checkout(db: Session, user: User, *, plan_id: str = "sub_monthly") -> dict[str, Any]:
    """Stripe subscription for monthly credits, or mock grant in dev."""
    from app.services.subscriptions import activate_subscription_from_payment

    if plan_id not in SUBSCRIPTION_PLANS:
        raise HTTPException(status_code=400, detail="Unknown subscription plan")

    if not settings.stripe_secret_key or not settings.stripe_subscription_price_id:
        if not settings.payment_mock_allowed:
            raise HTTPException(status_code=503, detail="订阅支付未配置")
        return {
            "mode": "mock",
            **activate_subscription_from_payment(
                db,
                user.id,
                plan_id,
                source="mock",
                external_id=f"mock_sub_{uuid.uuid4().hex}",
                channel="mock",
            ),
        }

    plan = SUBSCRIPTION_PLANS[plan_id]
    stripe_price = settings.stripe_subscription_price_id
    if plan_id == "sub_yearly" and settings.stripe_subscription_yearly_price_id:
        stripe_price = settings.stripe_subscription_yearly_price_id
    elif plan_id == "sub_yearly":
        return await create_stripe_checkout(db, user, plan_id)

    payload = {
        "mode": "subscription",
        "success_url": _success_url() + "&sub=1",
        "cancel_url": _cancel_url(),
        "client_reference_id": str(user.id),
        "metadata[user_id]": str(user.id),
        "metadata[plan_id]": plan_id,
        "line_items[0][price]": stripe_price,
        "line_items[0][quantity]": "1",
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.stripe.com/v1/checkout/sessions",
            data=payload,
            auth=(settings.stripe_secret_key, ""),
        )
    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail="Stripe subscription checkout failed")
    data = resp.json()
    return {"mode": "stripe", "session_id": data.get("id"), "url": data.get("url")}


def verify_stripe_webhook_payload(payload: bytes, sig_header: str | None) -> dict[str, Any]:
    """Verify Stripe-Signature when webhook secret is configured."""
    secret = settings.stripe_webhook_secret
    if not secret:
        if settings.stripe_secret_key:
            raise HTTPException(
                status_code=503,
                detail="Stripe webhook secret is not configured",
            )
        if not settings.payment_mock_allowed:
            raise HTTPException(
                status_code=503,
                detail="Stripe webhook verification is required outside dev mode",
            )
        try:
            return json.loads(payload)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="Invalid webhook payload") from exc

    if not sig_header:
        raise HTTPException(status_code=400, detail="Missing Stripe-Signature header")

    parts: dict[str, list[str]] = {}
    for item in sig_header.split(","):
        if "=" not in item:
            continue
        key, value = item.split("=", 1)
        parts.setdefault(key, []).append(value)

    timestamp = parts.get("t", [""])[0]
    signatures = parts.get("v1", [])
    if not timestamp or not signatures:
        raise HTTPException(status_code=400, detail="Invalid Stripe-Signature header")

    tolerance = settings.stripe_webhook_tolerance_seconds
    if abs(time.time() - int(timestamp)) > tolerance:
        raise HTTPException(status_code=400, detail="Webhook timestamp outside tolerance")

    signed_payload = f"{timestamp}.{payload.decode('utf-8')}"
    expected = hmac.new(secret.encode("utf-8"), signed_payload.encode("utf-8"), hashlib.sha256).hexdigest()
    if not any(hmac.compare_digest(expected, sig) for sig in signatures):
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    try:
        return json.loads(payload)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid webhook payload") from exc


def parse_stripe_webhook_payload(payload: bytes, sig_header: str | None) -> dict[str, Any]:
    return verify_stripe_webhook_payload(payload, sig_header)


def handle_stripe_webhook_event(db: Session, event: dict[str, Any]) -> dict[str, Any]:
    """Route Stripe webhook events to pack checkout or subscription handlers."""
    from app.services.cache import cache_get, cache_set
    from app.services.subscriptions import (
        activate_subscription_from_checkout,
        grant_subscription_invoice,
        sync_stripe_subscription_status,
    )

    event_id = event.get("id")
    if event_id:
        dedupe_key = f"stripe:event:{event_id}"
        if cache_get(dedupe_key):
            return {"received": True, "duplicate": event_id}
        cache_set(dedupe_key, "1", 86400 * 7)

    event_type = event.get("type")
    obj = event.get("data", {}).get("object", {})

    if event_type == "checkout.session.completed":
        if obj.get("mode") == "subscription":
            return activate_subscription_from_checkout(db, obj)
        metadata = obj.get("metadata") or {}
        user_id = metadata.get("user_id") or obj.get("client_reference_id")
        pack_id = metadata.get("pack_id")
        stripe_session_id = obj.get("id")
        if not user_id or not pack_id:
            return {"received": True, "skipped": "missing pack metadata"}
        return fulfill_payment(
            db,
            uuid.UUID(str(user_id)),
            pack_id,
            source="stripe",
            stripe_session_id=str(stripe_session_id) if stripe_session_id else None,
        )

    if event_type == "invoice.paid":
        return grant_subscription_invoice(db, obj)

    if event_type in ("customer.subscription.deleted", "customer.subscription.updated"):
        return sync_stripe_subscription_status(db, obj)

    return {"received": True, "skipped": event_type}
