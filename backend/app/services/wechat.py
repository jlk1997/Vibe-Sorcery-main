"""WeChat mini-program auth and pay."""

from __future__ import annotations

import hashlib
import hmac
import json
import time
import uuid
import xml.etree.ElementTree as ET
from urllib.parse import quote

import httpx
from fastapi import HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.config import settings
from app.models.schemas import CreditTransaction, User, WeChatUser
from app.services.auth import create_access_token, hash_password
from app.services.cache import cache_get, cache_set
from app.services.credits import add_credits
from app.services.payment_orders import complete_paid_order, mark_order_paid, register_pending_order


async def login_with_code(
    db: Session,
    code: str,
    *,
    terms_version: str | None = None,
    privacy_version: str | None = None,
    request=None,
) -> dict:
    """Exchange wx.login code for JWT. Uses mock openid when WeChat not configured."""
    openid = await _resolve_openid(code)
    link = db.query(WeChatUser).filter(WeChatUser.openid == openid).first()
    if link:
        user = db.query(User).filter(User.id == link.user_id).first()
        if not user:
            raise HTTPException(status_code=500, detail="WeChat user link broken")
        if terms_version and privacy_version:
            from app.services.legal import apply_registration_consents

            apply_registration_consents(db, user, terms_version, privacy_version, request=request)
            db.commit()
        token = create_access_token(str(user.id))
        return {"access_token": token, "token_type": "bearer", "user_id": str(user.id)}

    username = f"wx_{openid[-8:]}"
    email = f"{username}@wechat.local"
    existing = db.query(User).filter(User.username == username).first()
    is_new = False
    if existing:
        user = existing
    else:
        is_new = True
        user = User(
            email=email,
            username=username,
            hashed_password=hash_password(uuid.uuid4().hex),
            display_name="微信用户",
        )
        db.add(user)
        db.flush()
        from app.services.credits import grant_welcome_credits

        grant_welcome_credits(db, user.id)

    if is_new or (terms_version and privacy_version):
        from app.services.legal import apply_registration_consents, require_registration_consents

        if terms_version and privacy_version:
            require_registration_consents(terms_version, privacy_version)
            apply_registration_consents(db, user, terms_version, privacy_version, request=request)

    if not link:
        db.add(WeChatUser(user_id=user.id, openid=openid))
    db.commit()
    token = create_access_token(str(user.id))
    return {"access_token": token, "token_type": "bearer", "user_id": str(user.id)}


async def code2session(code: str) -> tuple[str, str]:
    """用 wx.login 的 code 换取 (openid, session_key)。

    虚拟支付的「用户态签名」需要 session_key，所以对外暴露完整结果。
    未配置微信且 debug 时返回 mock 值以便本地联调。
    """
    if not settings.wechat_app_id or not settings.wechat_app_secret:
        if not settings.debug:
            raise HTTPException(status_code=503, detail="WeChat login is not configured")
        digest = hashlib.sha256(f"{settings.jwt_secret}:{code}".encode()).hexdigest()
        return f"mock_{digest[:24]}", f"mocksession_{digest[:16]}"
    url = (
        "https://api.weixin.qq.com/sns/jscode2session"
        f"?appid={settings.wechat_app_id}&secret={settings.wechat_app_secret}"
        f"&js_code={code}&grant_type=authorization_code"
    )
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url)
    data = resp.json()
    openid = data.get("openid")
    if not openid:
        raise HTTPException(status_code=400, detail=data.get("errmsg", "WeChat login failed"))
    return openid, data.get("session_key", "")


async def _resolve_openid(code: str) -> str:
    openid, _ = await code2session(code)
    return openid


def _wechat_sign(params: dict[str, str], api_key: str) -> str:
    items = sorted((k, v) for k, v in params.items() if v and k != "sign")
    raw = "&".join(f"{k}={v}" for k, v in items)
    return hashlib.md5(f"{raw}&key={api_key}".encode()).hexdigest().upper()


def _dict_to_xml(data: dict[str, str]) -> str:
    parts = ["<xml>"]
    for key, value in data.items():
        parts.append(f"<{key}><![CDATA[{value}]]></{key}>")
    parts.append("</xml>")
    return "".join(parts)


def _xml_to_dict(xml_bytes: bytes) -> dict[str, str]:
    root = ET.fromstring(xml_bytes)
    return {child.tag: child.text or "" for child in root}


def _notify_url() -> str:
    base = settings.api_public_url.rstrip("/")
    if base.endswith("/api/v1"):
        return f"{base}/billing/wechat/notify"
    return f"{base}/api/v1/billing/wechat/notify"


def _pack_amount_fen(pack: dict) -> int:
    return int(pack.get("amount_fen") or pack["amount_cents"])


def _new_out_trade_no(prefix: str = "wx") -> str:
    return f"{prefix}{uuid.uuid4().hex[:24]}"


def _client_ip(request=None) -> str:
    if request is None:
        return "127.0.0.1"
    forwarded = request.headers.get("x-forwarded-for") or ""
    if forwarded:
        return forwarded.split(",")[0].strip() or "127.0.0.1"
    if request.client and request.client.host:
        return request.client.host
    return "127.0.0.1"


async def _unified_order(
    db: Session,
    user: User,
    pack_id: str,
    *,
    trade_type: str,
    openid: str | None = None,
    channel_suffix: str,
    payment_terms_version: str | None = None,
    client_ip: str | None = None,
) -> dict:
    from app.services.billing import fulfill_payment, get_product, product_amount_fen

    product = get_product(pack_id)
    if not product:
        raise HTTPException(status_code=400, detail="Unknown product_id")

    amount_fen = product_amount_fen(product)
    out_trade_no = _new_out_trade_no()

    if not settings.wechat_pay_enabled:
        if not settings.payment_mock_allowed:
            raise HTTPException(status_code=503, detail="微信支付未配置")
        register_pending_order(
            db,
            user_id=user.id,
            pack_id=pack_id,
            channel=f"wechat_{channel_suffix}",
            out_trade_no=out_trade_no,
            amount_fen=amount_fen,
            payment_terms_version=payment_terms_version,
        )
        result = fulfill_payment(db, user.id, pack_id, source="wechat_pay", external_id=out_trade_no)
        mark_order_paid(db, out_trade_no, out_trade_no)
        return {"mode": "mock", "pack_id": pack_id, "out_trade_no": out_trade_no, **result}

    params: dict[str, str] = {
        "appid": settings.wechat_app_id,
        "mch_id": settings.wechat_pay_mch_id,
        "nonce_str": uuid.uuid4().hex[:16],
        "body": product["label"],
        "out_trade_no": out_trade_no,
        "total_fee": str(amount_fen),
        "spbill_create_ip": client_ip or "127.0.0.1",
        "notify_url": _notify_url(),
        "trade_type": trade_type,
    }
    if trade_type == "JSAPI":
        if not openid or openid.startswith("mock_"):
            raise HTTPException(
                status_code=400,
                detail="请使用微信登录后再支付（邮箱账号未绑定 openid，无法拉起小程序支付）",
            )
        params["openid"] = openid
    if trade_type == "MWEB":
        scene = {
            "h5_info": {
                "type": "Wap",
                "wap_url": settings.frontend_base_url.rstrip("/"),
                "wap_name": settings.app_name,
            }
        }
        params["scene_info"] = json.dumps(scene, ensure_ascii=False)

    params["sign"] = _wechat_sign(params, settings.wechat_pay_api_key)

    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            "https://api.mch.weixin.qq.com/pay/unifiedorder",
            content=_dict_to_xml(params).encode("utf-8"),
            headers={"Content-Type": "application/xml"},
        )
    data = _xml_to_dict(resp.content)
    if data.get("return_code") != "SUCCESS" or data.get("result_code") != "SUCCESS":
        err_code = data.get("err_code") or ""
        msg = data.get("err_code_des") or data.get("return_msg") or "WeChat pay failed"
        # SIGNERROR / 签名错误：几乎总是 APIv2 密钥填错（误填了 v3）或 AppID/商户号不匹配
        if "签名" in msg or err_code in ("SIGNERROR", "SIGN_ERROR"):
            msg = (
                "微信支付签名错误：请到商户平台「账户中心 → API安全」重新设置"
                "【APIv2密钥】（32位），填入 WECHAT_PAY_API_KEY 后重启后端；"
                "不要填 APIv3 密钥。并确认 WECHAT_APP_ID 与商户号已关联。"
            )
        detail = f"{err_code}: {msg}" if err_code else msg
        raise HTTPException(status_code=502, detail=detail)

    register_pending_order(
        db,
        user_id=user.id,
        pack_id=pack_id,
        channel=f"wechat_{channel_suffix}",
        out_trade_no=out_trade_no,
        amount_fen=amount_fen,
        payment_terms_version=payment_terms_version,
    )

    return data, out_trade_no, pack_id


async def create_wechat_prepay(
    db: Session,
    user: User,
    pack_id: str,
    *,
    payment_terms_version: str | None = None,
    request=None,
) -> dict:
    """JSAPI prepay for mini-program."""
    link = db.query(WeChatUser).filter(WeChatUser.user_id == user.id).first()
    openid = link.openid if link else None
    result = await _unified_order(
        db,
        user,
        pack_id,
        trade_type="JSAPI",
        openid=openid,
        channel_suffix="jsapi",
        payment_terms_version=payment_terms_version,
        client_ip=_client_ip(request),
    )
    if isinstance(result, dict) and result.get("mode") == "mock":
        return result

    data, out_trade_no, _ = result
    prepay_id = data.get("prepay_id", "")
    ts = str(int(time.time()))
    pay_params = {
        "appId": settings.wechat_app_id,
        "timeStamp": ts,
        "nonceStr": uuid.uuid4().hex[:16],
        "package": f"prepay_id={prepay_id}",
        "signType": "MD5",
    }
    pay_params["paySign"] = _wechat_sign(pay_params, settings.wechat_pay_api_key)

    return {
        "mode": "wechat",
        "pack_id": pack_id,
        "out_trade_no": out_trade_no,
        "scene": "jsapi",
        "payment": pay_params,
    }


async def create_wechat_unified_order(
    db: Session,
    user: User,
    pack_id: str,
    *,
    trade_type: str,
    payment_terms_version: str | None = None,
    request=None,
) -> dict:
    """NATIVE (QR) or MWEB (H5) for web/mobile browser."""
    result = await _unified_order(
        db,
        user,
        pack_id,
        trade_type=trade_type,
        openid=None,
        channel_suffix=trade_type.lower(),
        payment_terms_version=payment_terms_version,
        client_ip=_client_ip(request),
    )
    if isinstance(result, dict) and result.get("mode") == "mock":
        result["scene"] = trade_type.lower()
        return result

    data, out_trade_no, _ = result
    payload: dict = {
        "mode": "wechat",
        "pack_id": pack_id,
        "out_trade_no": out_trade_no,
        "scene": trade_type.lower(),
    }
    if trade_type == "NATIVE":
        payload["code_url"] = data.get("code_url")
    else:
        mweb = data.get("mweb_url", "")
        if mweb:
            redirect = settings.frontend_page("/pages/settings/index", checkout="success", channel="wechat")
            payload["pay_url"] = f"{mweb}&redirect_url={quote(redirect, safe='')}"
    return payload


def handle_wechat_pay_notify(db: Session, body: bytes) -> Response:
    """Verify WeChat pay callback and grant credits."""
    if not settings.wechat_pay_enabled:
        return Response(
            content=_dict_to_xml({"return_code": "FAIL", "return_msg": "disabled"}),
            media_type="application/xml",
        )

    data = _xml_to_dict(body)
    if data.get("return_code") != "SUCCESS" or data.get("result_code") != "SUCCESS":
        return Response(content=_dict_to_xml({"return_code": "FAIL", "return_msg": "invalid"}), media_type="application/xml")

    if settings.wechat_pay_api_key:
        sign = data.pop("sign", "")
        expected = _wechat_sign(data, settings.wechat_pay_api_key)
        if not hmac.compare_digest(sign, expected):
            return Response(content=_dict_to_xml({"return_code": "FAIL", "return_msg": "sign"}), media_type="application/xml")

    out_trade_no = data.get("out_trade_no", "")
    transaction_id = data.get("transaction_id") or out_trade_no

    from app.models.schemas import PaymentOrder
    from app.services.payment_security import validate_wechat_notify_fields

    pending = db.query(PaymentOrder).filter(PaymentOrder.out_trade_no == out_trade_no).first()
    if not pending:
        legacy = cache_get(f"payment_order:{out_trade_no}")
        if not legacy:
            return Response(content=_dict_to_xml({"return_code": "SUCCESS", "return_msg": "OK"}), media_type="application/xml")
        return Response(content=_dict_to_xml({"return_code": "FAIL", "return_msg": "order"}), media_type="application/xml")

    err = validate_wechat_notify_fields(data, pending)
    if err:
        if err == "order_expired":
            pending.status = "expired"
            db.commit()
        return Response(content=_dict_to_xml({"return_code": "FAIL", "return_msg": err}), media_type="application/xml")

    complete_paid_order(db, out_trade_no, provider_tx_id=transaction_id, source="wechat_pay")
    return Response(content=_dict_to_xml({"return_code": "SUCCESS", "return_msg": "OK"}), media_type="application/xml")
