"""Unified payment entry — WeChat / Alipay / Stripe routing."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from app.models.schemas import User
from app.services.billing import get_product, is_subscription_product
from app.services import billing as billing_service
from app.services.alipay import create_alipay_payment
from app.services.legal import record_payment_terms_consent
from app.services.wechat import create_wechat_prepay, create_wechat_unified_order


async def create_payment(
    db: Session,
    user: User,
    pack_id: str,
    channel: str,
    scene: str,
    *,
    payment_terms_version: str | None = None,
    request: Request | None = None,
) -> dict[str, Any]:
    channel = channel.lower().strip()
    scene = scene.lower().strip()

    if not get_product(pack_id):
        raise HTTPException(status_code=400, detail="Unknown product_id")

    if payment_terms_version:
        record_payment_terms_consent(db, user, payment_terms_version, request=request)

    if channel == "stripe":
        if is_subscription_product(pack_id):
            return await billing_service.create_subscription_checkout(db, user, plan_id=pack_id)
        return await billing_service.create_stripe_checkout(db, user, pack_id)

    if channel == "alipay":
        if scene not in ("web", "h5"):
            raise HTTPException(status_code=400, detail="支付宝仅支持 web 或 h5 场景")
        return await create_alipay_payment(
            db, user, pack_id, scene=scene, payment_terms_version=payment_terms_version
        )

    if channel == "wechat":
        if scene == "jsapi":
            return await create_wechat_prepay(
                db,
                user,
                pack_id,
                payment_terms_version=payment_terms_version,
                request=request,
            )
        if scene in ("native", "h5"):
            return await create_wechat_unified_order(
                db,
                user,
                pack_id,
                trade_type="NATIVE" if scene == "native" else "MWEB",
                payment_terms_version=payment_terms_version,
                request=request,
            )
        raise HTTPException(status_code=400, detail="微信 scene 需为 jsapi / native / h5")

    raise HTTPException(status_code=400, detail="不支持的支付渠道")
