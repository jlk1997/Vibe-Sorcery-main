"""微信小程序「虚拟支付」（道具直购 / 米大师）。

合规背景：小程序内销售虚拟商品（额度/会员等）必须接入官方虚拟支付
`wx.requestVirtualPayment`，不能用普通微信支付。

安全设计：AppKey 与用户 session_key 只留在服务端，签名在服务端完成，
前端只拿到 signData/paySig/signature 直接调用 `wx.requestVirtualPayment`。

发货可靠性：微信文档要求「推送分支」「轮询分支」至少实现其一。这里实现轮询：
前端支付成功后轮询订单状态，后端调用 `/xpay/query_order` 向微信核对，
确认为「已支付/发货中/已发货」(status 2/3/4) 且金额一致后，才幂等发货。
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import uuid

import httpx
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.models.schemas import PaymentOrder, User, WeChatUser
from app.services.billing import (
    get_product,
    product_amount_fen,
    wechat_vpay_product_id,
)
from app.services.cache import cache_get, cache_set
from app.services.credits import get_or_create_credits
from app.services.payment_orders import complete_paid_order, register_pending_order
from app.services.wechat import code2session

logger = logging.getLogger(__name__)

VPAY_CHANNEL = "wechat_vpay"
_WX_BASE = "https://api.weixin.qq.com"
# order.status 表示已付款及之后（已支付待发货 / 发货中 / 已发货）
_PAID_STATUSES = {2, 3, 4}


def _appkey() -> str:
    return settings.wechat_vpay_appkey


def _env() -> int:
    """0 = 现网(正式)，1 = 沙箱。"""
    return 1 if settings.wechat_vpay_env == 1 else 0


def calc_pay_sig(uri: str, post_body: str, appkey: str) -> str:
    """支付签名：hmac_sha256(appKey, uri + '&' + post_body)。"""
    need_sign = f"{uri}&{post_body}"
    return hmac.new(appkey.encode("utf-8"), need_sign.encode("utf-8"), hashlib.sha256).hexdigest()


def calc_signature(post_body: str, session_key: str) -> str:
    """用户态签名：hmac_sha256(sessionKey, post_body)。"""
    return hmac.new(session_key.encode("utf-8"), post_body.encode("utf-8"), hashlib.sha256).hexdigest()


def _dumps(payload: dict) -> str:
    """紧凑、确定性 JSON；返回给前端的 signData 必须与签名所用字符串完全一致。"""
    return json.dumps(payload, separators=(",", ":"), ensure_ascii=False)


async def _get_access_token() -> str:
    cached = cache_get("wechat_access_token")
    if cached:
        return cached
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{_WX_BASE}/cgi-bin/token",
            params={
                "grant_type": "client_credential",
                "appid": settings.wechat_app_id,
                "secret": settings.wechat_app_secret,
            },
        )
    data = resp.json()
    token = data.get("access_token")
    if not token:
        raise HTTPException(status_code=502, detail=f"获取微信 access_token 失败: {data.get('errmsg')}")
    cache_set("wechat_access_token", token, max(60, int(data.get("expires_in", 7200)) - 300))
    return token


async def create_vpay_order(
    db: Session,
    user: User,
    pack_id: str,
    *,
    code: str,
    platform: str = "android",
    payment_terms_version: str | None = None,
) -> dict:
    """道具直购下单：换取 openid+session_key，建 pending 单，服务端签名。"""
    product = get_product(pack_id)
    if not product:
        raise HTTPException(status_code=400, detail="Unknown product_id")
    amount_fen = product_amount_fen(product)

    # iOS Apple 支付最低 1 元；platform 仅作校验/日志，不进入签名
    plat_norm = (platform or "android").lower()
    if plat_norm == "ios" and amount_fen < 100:
        raise HTTPException(status_code=400, detail="iOS 最低支付金额为 1 元，请选择其他商品")

    # 未配置虚拟支付：仅 debug 下走 mock 直接发货，便于本地联调
    if not settings.wechat_vpay_enabled:
        if not settings.debug:
            raise HTTPException(status_code=503, detail="虚拟支付未配置")
        out_trade_no = f"vpmock{uuid.uuid4().hex[:20]}"
        register_pending_order(
            db,
            user_id=user.id,
            pack_id=pack_id,
            channel=VPAY_CHANNEL,
            out_trade_no=out_trade_no,
            amount_fen=amount_fen,
            payment_terms_version=payment_terms_version,
        )
        complete_paid_order(db, out_trade_no, source=VPAY_CHANNEL)
        balance = get_or_create_credits(db, user.id).balance
        return {"mode": "mock", "out_trade_no": out_trade_no, "balance": balance}

    openid, session_key = await code2session(code)
    if not session_key:
        raise HTTPException(status_code=400, detail="缺少 session_key，请重新登录后再试")

    out_trade_no = f"vp{uuid.uuid4().hex[:22]}"
    env = _env()
    if plat_norm == "ios" and env == 1:
        raise HTTPException(
            status_code=400,
            detail="iOS 仅支持现网虚拟支付，请将 WECHAT_VPAY_ENV 设为 0",
        )

    product_id = wechat_vpay_product_id(pack_id)
    if product_id == pack_id:
        # 未在后台/配置里映射道具ID，微信大概率会因找不到道具而拒单
        logger.warning(
            "vpay: 商品 %s 未配置微信道具ID(productId)，请在小程序后台创建道具并填入映射", pack_id
        )

    # 官方已废弃 signData.platform；勿写入，否则易签名失败。设备路由由微信客户端完成。
    sign_payload = {
        "offerId": settings.wechat_offer_id,
        "buyQuantity": 1,
        "env": env,
        "currencyType": "CNY",
        "productId": product_id,
        "goodsPrice": amount_fen,
        "outTradeNo": out_trade_no,
        "attach": pack_id,
    }
    sign_data = _dumps(sign_payload)
    pay_sig = calc_pay_sig("requestVirtualPayment", sign_data, _appkey())
    signature = calc_signature(sign_data, session_key)

    register_pending_order(
        db,
        user_id=user.id,
        pack_id=pack_id,
        channel=VPAY_CHANNEL,
        out_trade_no=out_trade_no,
        amount_fen=amount_fen,
        payment_terms_version=payment_terms_version,
    )
    # 缓存 openid 供后续 query_order 使用（query_order 只需 pay_sig，无需 session_key）
    cache_set(f"vpay_openid:{out_trade_no}", openid, 7200)
    logger.info("vpay prepare ok pack=%s platform=%s env=%s out=%s", pack_id, plat_norm, env, out_trade_no)

    return {
        "mode": "vpay",
        "pack_id": pack_id,
        "out_trade_no": out_trade_no,
        "env": env,
        "vpay": {
            "mode": "short_series_goods",
            "signData": sign_data,
            "paySig": pay_sig,
            "signature": signature,
        },
    }


def _order_openid(db: Session, order: PaymentOrder, override: str | None = None) -> str | None:
    if override:
        return override
    cached = cache_get(f"vpay_openid:{order.out_trade_no}")
    if cached:
        return cached
    link = db.query(WeChatUser).filter(WeChatUser.user_id == order.user_id).first()
    return link.openid if link else None


async def query_vpay_order(db: Session, out_trade_no: str, *, openid: str | None = None) -> str:
    """向微信核对虚拟支付订单；已支付则幂等发货。返回本地订单状态。

    openid 可由发货推送直接传入，避免依赖缓存/数据库回查。
    """
    order = db.query(PaymentOrder).filter(PaymentOrder.out_trade_no == out_trade_no).first()
    if not order:
        return "unknown"
    if order.status in ("paid", "expired"):
        return order.status
    if order.channel != VPAY_CHANNEL or not settings.wechat_vpay_enabled:
        return order.status

    resolved_openid = _order_openid(db, order, openid)
    if not resolved_openid:
        logger.warning("vpay query skipped: no openid for order %s", out_trade_no)
        return order.status

    body = _dumps({"openid": resolved_openid, "env": _env(), "order_id": out_trade_no})
    pay_sig = calc_pay_sig("/xpay/query_order", body, _appkey())

    try:
        token = await _get_access_token()
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{_WX_BASE}/xpay/query_order",
                params={"access_token": token, "pay_sig": pay_sig},
                content=body.encode("utf-8"),
                headers={"Content-Type": "application/json"},
            )
        data = resp.json()
    except Exception:
        logger.warning("vpay query_order request failed for %s", out_trade_no)
        return order.status

    if data.get("errcode", -1) != 0:
        return order.status

    info = data.get("order") or {}
    status_val = info.get("status")
    order_fee = info.get("order_fee")
    # 双重校验：状态为已支付，且订单金额与本地一致，才发货，避免误判/金额被篡改
    if status_val in _PAID_STATUSES and int(order_fee or -1) == int(order.amount_fen):
        complete_paid_order(
            db,
            out_trade_no,
            provider_tx_id=str(info.get("wxpay_order_id") or info.get("wx_order_id") or out_trade_no),
            source=VPAY_CHANNEL,
        )
        logger.info("vpay order fulfilled via query: %s status=%s", out_trade_no, status_val)
        return "paid"
    if status_val is not None and status_val >= 5:
        logger.info("vpay order %s in terminal non-paid status=%s", out_trade_no, status_val)
    return order.status


def _verify_push_signature(token: str, params) -> bool:
    """校验消息推送来源（明文/兼容模式）：sha1(sort(token,timestamp,nonce)) == signature。"""
    signature = params.get("signature", "")
    timestamp = params.get("timestamp", "")
    nonce = params.get("nonce", "")
    if not (signature and timestamp and nonce):
        return False
    raw = "".join(sorted([token, timestamp, nonce]))
    expected = hashlib.sha1(raw.encode("utf-8")).hexdigest()
    return hmac.compare_digest(signature, expected)


def _push_ok() -> JSONResponse:
    return JSONResponse(content={"ErrCode": 0, "ErrMsg": "success"})


def _ios_refund_query_advice(db: Session, pay_order_id: str | None) -> tuple[int, str, str]:
    """Apple 退款问询策略：额度未花完建议退款；已基本消耗则拦截。

    Returns: (result_code, result_info, evidence)
      result_code 0 = 建议退款，1 = 拒绝退款
    """
    from app.services.billing import CREDIT_PACKS

    if not pay_order_id:
        return 0, "missing pay_order_id", "no order id; recommend refund for user protection"
    order = db.query(PaymentOrder).filter(PaymentOrder.out_trade_no == pay_order_id).first()
    if not order:
        return 0, "order not found", f"order {pay_order_id} not found locally; recommend refund"
    if order.status != "paid":
        return 0, f"order status={order.status}", f"order {pay_order_id} not in paid state; recommend refund"

    pack = CREDIT_PACKS.get(order.pack_id) or {}
    granted = int(pack.get("credits") or 0)
    if granted <= 0:
        # 会员/决斗卡等：建议退款并交人工复核（Apple 仍有最终决定权）
        return (
            0,
            "non-credit product",
            f"order {pay_order_id} pack={order.pack_id}; recommend refund pending manual review",
        )

    balance = int(get_or_create_credits(db, order.user_id).balance or 0)
    if balance < granted:
        return (
            1,
            "credits consumed",
            f"order {pay_order_id} granted={granted} balance={balance}; reject refund",
        )
    return (
        0,
        "credits unused",
        f"order {pay_order_id} granted={granted} balance={balance}; recommend refund",
    )


async def handle_xpay_notify(db: Session, request: Request) -> JSONResponse:
    """处理虚拟支付发货推送（xpay_goods_deliver_notify 等）。

    可靠性：不直接信任推送金额，而是拿 OutTradeNo + OpenId 反查 query_order
    向微信二次核对后再幂等发货，防伪造/重放。
    """
    params = request.query_params
    token = settings.wechat_push_token
    if token and not _verify_push_signature(token, params):
        logger.warning("xpay notify: signature mismatch")
        return _push_ok()  # 返回成功避免微信重复重推；但不处理

    raw = await request.body()
    payload: dict = {}
    text = raw.decode("utf-8", errors="ignore").strip()
    if text.startswith("<"):
        # XML 数据格式
        from app.services.wechat import _xml_to_dict

        try:
            payload = _xml_to_dict(raw)
        except Exception:
            payload = {}
    else:
        try:
            payload = json.loads(text or "{}")
        except Exception:
            payload = {}
    if not payload:
        logger.warning("xpay notify: unparsable body")
        return _push_ok()

    event = payload.get("Event") or payload.get("event")
    out_trade_no = payload.get("OutTradeNo") or payload.get("out_trade_no")
    openid = payload.get("OpenId") or payload.get("openid")
    logger.info("xpay notify event=%s out_trade_no=%s", event, out_trade_no)

    # 发货类事件：核对并发货
    if event in ("xpay_goods_deliver_notify", "xpay_coin_pay_notify") and out_trade_no:
        try:
            await query_vpay_order(db, out_trade_no, openid=openid)
        except Exception:
            logger.exception("xpay notify: fulfill failed for %s", out_trade_no)

    # 退款事件：退款成功(RetCode=0)则回退权益。商户单号字段为 MchOrderId
    elif event == "xpay_refund_notify":
        ret_code = payload.get("RetCode", payload.get("ret_code"))
        refund_order_no = payload.get("MchOrderId") or payload.get("mch_order_id") or out_trade_no
        if str(ret_code) in ("0", "0.0") and refund_order_no:
            try:
                from app.services.payment_orders import revoke_paid_order

                revoke_paid_order(db, refund_order_no, reason="refund")
            except Exception:
                logger.exception("xpay notify: refund revoke failed for %s", refund_order_no)

    # Apple 退款问询：须尽快应答（官方要求约 3 秒内）
    elif event == "xpay_subscribe_ios_refund_query_notify":
        pay_order_id = (
            payload.get("pay_order_id")
            or payload.get("PayOrderId")
            or payload.get("OutTradeNo")
            or out_trade_no
        )
        try:
            result_code, result_info, evidence = _ios_refund_query_advice(db, pay_order_id)
        except Exception:
            logger.exception("xpay notify: ios refund query failed for %s", pay_order_id)
            result_code, result_info, evidence = (
                0,
                "internal error",
                "handler error; recommend refund",
            )
        logger.info(
            "xpay ios refund query pay_order_id=%s result_code=%s",
            pay_order_id,
            result_code,
        )
        return JSONResponse(
            content={
                "ErrCode": 0,
                "ErrMsg": "success",
                "result_code": result_code,
                "result_info": result_info,
                "evidence": evidence,
            }
        )

    # 投诉/风控事件：记录以便人工介入，回执成功避免重推
    elif event in ("xpay_complaint_notify", "xpay_wxpay_callback_notify"):
        logger.warning("xpay notify needs attention: event=%s payload=%s", event, payload)

    return _push_ok()
