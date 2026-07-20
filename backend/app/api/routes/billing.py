"""Stripe / mock billing for credit packs."""

from pydantic import BaseModel, Field

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_optional_user
from app.api.rate_limits import check_billing_rate_limit, check_webhook_rate_limit
from app.database import get_db
from app.models.schemas import User
from app.services import billing as billing_service
from app.services.alipay import handle_alipay_notify
from app.services.payment_orders import get_order_status, list_user_orders
from app.services.payments import create_payment
from app.services.subscriptions import (
    cancel_subscription,
    create_stripe_billing_portal,
    get_user_subscription,
    subscription_to_dict,
)
from app.services.legal import require_payment_terms
from app.services.wechat import create_wechat_prepay, handle_wechat_pay_notify

router = APIRouter(prefix="/billing", tags=["billing"])

BILLING_CATALOG_TTL = 300


def _cached_catalog(key: str, builder):
    from app.services.cache import cache_get, cache_set

    hit = cache_get(key)
    if hit is not None:
        return JSONResponse(content=hit, headers={"Cache-Control": f"public, max-age={BILLING_CATALOG_TTL}"})
    data = builder()
    cache_set(key, data, BILLING_CATALOG_TTL)
    return JSONResponse(content=data, headers={"Cache-Control": f"public, max-age={BILLING_CATALOG_TTL}"})


class CheckoutRequest(BaseModel):
    pack_id: str = Field(min_length=1)
    accepted_payment_terms_version: str | None = None


class PayRequest(BaseModel):
    pack_id: str = Field(min_length=1)
    channel: str = Field(description="wechat | alipay | stripe")
    scene: str = Field(default="web", description="web | h5 | native | jsapi | checkout")
    accepted_payment_terms_version: str | None = None


class SubscribeRequest(BaseModel):
    plan_id: str = Field(default="sub_monthly")
    accepted_payment_terms_version: str | None = None


class VpayPrepareRequest(BaseModel):
    pack_id: str = Field(min_length=1)
    code: str = Field(min_length=1, description="wx.login() 返回的 code，用于换取 openid/session_key")
    platform: str = Field(default="android", description="android | windows | ios（仅日志/校验，不进签名）")
    accepted_payment_terms_version: str | None = None


class CancelSubscriptionRequest(BaseModel):
    immediate: bool = False


@router.get("/packs")
def list_credit_packs():
    return _cached_catalog("billing:packs", billing_service.list_packs)


@router.get("/estimate")
def estimate_generation_credits(
    mode: str = "single",
    count: int = 1,
    variations: int | None = None,
):
    from app.services.credit_estimates import estimate_credits

    return estimate_credits(mode=mode, count=count, variations=variations)


@router.get("/plans")
def list_subscription_plans():
    return _cached_catalog("billing:plans", billing_service.list_plans)


@router.get("/methods")
def list_payment_methods():
    return _cached_catalog("billing:methods", billing_service.list_payment_methods)


@router.get("/subscription")
def get_subscription(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    sub = get_user_subscription(db, user.id)
    return subscription_to_dict(sub)


@router.post("/subscription/cancel")
async def cancel_user_subscription(
    payload: CancelSubscriptionRequest = CancelSubscriptionRequest(),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_billing_rate_limit(user)
    return await cancel_subscription(db, user.id, immediate=payload.immediate)


@router.get("/portal")
async def stripe_billing_portal(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return await create_stripe_billing_portal(db, user)


@router.get("/cn-recurring/status")
def cn_recurring_status(db: Session = Depends(get_db), user: User | None = Depends(get_optional_user)):
    """WeChat/Alipay native recurring — roadmap; manual renewal active."""
    from app.config import settings
    from app.models.schemas import CnRecurringWaitlist

    on_waitlist = False
    if user:
        on_waitlist = (
            db.query(CnRecurringWaitlist)
            .filter(CnRecurringWaitlist.user_id == user.id)
            .first()
            is not None
        )
    return {
        "available": False,
        "manual_renewal": True,
        "on_waitlist": on_waitlist,
        "message": "中国区当前为到期前手动续费；微信委托代扣与支付宝周期扣款即将上线",
        "wechat_enabled": settings.wechat_pay_enabled,
        "alipay_enabled": settings.alipay_enabled,
    }


@router.post("/cn-recurring/waitlist")
def cn_recurring_waitlist(
    payload: dict,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.services.ecosystem import join_cn_recurring_waitlist

    channel = str(payload.get("channel") or "wechat")
    return join_cn_recurring_waitlist(db, user, channel=channel)


@router.post("/pay")
async def unified_pay(
    payload: PayRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """统一支付入口：微信 / 支付宝 / Stripe。"""
    check_billing_rate_limit(user)
    terms_version = require_payment_terms(payload.accepted_payment_terms_version)
    return await create_payment(
        db,
        user,
        payload.pack_id,
        payload.channel,
        payload.scene,
        payment_terms_version=terms_version,
        request=request,
    )


@router.get("/orders")
def list_payment_orders(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = 20,
):
    return list_user_orders(db, user.id, limit=min(limit, 50))


@router.get("/orders/{out_trade_no}")
async def payment_order_status(
    out_trade_no: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = get_order_status(db, out_trade_no, user.id)
    if not row:
        return {"status": "unknown"}
    # 虚拟支付订单：轮询时主动向微信核对，已支付则幂等发货
    if row["status"] != "paid" and row.get("channel") == "wechat_vpay":
        from app.services.virtual_payment import query_vpay_order

        await query_vpay_order(db, out_trade_no)
        row = get_order_status(db, out_trade_no, user.id) or row
    if row["status"] == "paid":
        from app.services.credits import get_or_create_credits

        balance = get_or_create_credits(db, user.id).balance
        return {**row, "balance": balance}
    return row


@router.get("/vpay/config")
def vpay_config(user: User = Depends(get_current_user)):
    """（管理员）查看虚拟支付配置状态与道具映射对照，便于后台配置核对。"""
    from app.api.deps import require_admin

    require_admin(user)
    from app.config import settings as _s
    from app.services.billing import vpay_goods_report

    return {
        "enabled": _s.wechat_vpay_enabled,
        "env": _s.wechat_vpay_env,
        "offer_id": _s.wechat_offer_id,
        "appkey_set": bool(_s.wechat_vpay_appkey),
        "push_token_set": bool(_s.wechat_push_token),
        "goods": vpay_goods_report(),
    }


@router.post("/vpay/prepare")
async def vpay_prepare(
    payload: VpayPrepareRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """微信虚拟支付（道具直购）下单，返回前端 wx.requestVirtualPayment 所需签名。"""
    check_billing_rate_limit(user)
    from app.services.legal import record_payment_terms_consent
    from app.services.virtual_payment import create_vpay_order

    terms_version = require_payment_terms(payload.accepted_payment_terms_version)
    if terms_version:
        record_payment_terms_consent(db, user, terms_version, request=request)
    return await create_vpay_order(
        db,
        user,
        payload.pack_id,
        code=payload.code,
        platform=payload.platform,
        payment_terms_version=terms_version,
    )


@router.post("/checkout")
async def create_checkout(
    payload: CheckoutRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_billing_rate_limit(user)
    require_payment_terms(payload.accepted_payment_terms_version)
    return await billing_service.create_stripe_checkout(db, user, payload.pack_id)


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    db: Session = Depends(get_db),
    stripe_signature: str | None = Header(default=None, alias="Stripe-Signature"),
):
    check_webhook_rate_limit(request)
    body = await request.body()
    event = billing_service.parse_stripe_webhook_payload(body, stripe_signature)
    return billing_service.handle_stripe_webhook_event(db, event)


@router.post("/subscribe")
async def create_subscription_checkout(
    payload: SubscribeRequest = SubscribeRequest(),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_billing_rate_limit(user)
    require_payment_terms(payload.accepted_payment_terms_version)
    return await billing_service.create_subscription_checkout(db, user, plan_id=payload.plan_id)


@router.post("/wechat/prepay")
async def wechat_prepay(
    payload: CheckoutRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_billing_rate_limit(user)
    require_payment_terms(payload.accepted_payment_terms_version)
    return await create_wechat_prepay(db, user, payload.pack_id)


@router.post("/wechat/notify")
async def wechat_pay_notify(request: Request, db: Session = Depends(get_db)):
    check_webhook_rate_limit(request)
    body = await request.body()
    return handle_wechat_pay_notify(db, body)


@router.get("/wechat/xpay-notify")
async def wechat_xpay_verify(
    signature: str = "",
    timestamp: str = "",
    nonce: str = "",
    echostr: str = "",
):
    """消息推送 URL 校验（MP 保存推送配置时会发一次 GET）。"""
    from app.config import settings as _settings
    from app.services.virtual_payment import _verify_push_signature
    from fastapi.responses import PlainTextResponse

    token = _settings.wechat_push_token
    params = {"signature": signature, "timestamp": timestamp, "nonce": nonce}
    if not token or _verify_push_signature(token, params):
        return PlainTextResponse(echostr)
    return PlainTextResponse("", status_code=403)


@router.post("/wechat/xpay-notify")
async def wechat_xpay_notify(request: Request, db: Session = Depends(get_db)):
    """虚拟支付发货推送（xpay_goods_deliver_notify 等）。"""
    check_webhook_rate_limit(request)
    from app.services.virtual_payment import handle_xpay_notify

    return await handle_xpay_notify(db, request)


@router.post("/alipay/notify")
async def alipay_pay_notify(request: Request, db: Session = Depends(get_db)):
    check_webhook_rate_limit(request)
    form = dict(await request.form())
    result = handle_alipay_notify(db, {k: str(v) for k, v in form.items()})
    return result
