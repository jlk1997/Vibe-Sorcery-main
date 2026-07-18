"""Alipay OpenAPI RSA2 — page pay (PC) & wap pay (H5)."""

from __future__ import annotations

import base64
import json
import uuid
from datetime import datetime
from typing import Any
from urllib.parse import quote_plus, urlencode

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.models.schemas import User
from app.services.billing import fulfill_payment, get_product, product_amount_fen
from app.services.payment_orders import complete_paid_order, mark_order_paid, register_pending_order


def _normalize_pem(raw: str) -> str:
    return raw.replace("\\n", "\n").strip()


def _sign_content(content: str, private_key_pem: str) -> str:
    key = serialization.load_pem_private_key(_normalize_pem(private_key_pem).encode(), password=None)
    signature = key.sign(content.encode("utf-8"), padding.PKCS1v15(), hashes.SHA256())
    return base64.b64encode(signature).decode("utf-8")


def _verify_content(content: str, signature_b64: str, public_key_pem: str) -> bool:
    try:
        key = serialization.load_pem_public_key(_normalize_pem(public_key_pem).encode())
        key.verify(
            base64.b64decode(signature_b64),
            content.encode("utf-8"),
            padding.PKCS1v15(),
            hashes.SHA256(),
        )
        return True
    except Exception:
        return False


def _notify_url() -> str:
    base = settings.api_public_url.rstrip("/")
    if base.endswith("/api/v1"):
        return f"{base}/billing/alipay/notify"
    return f"{base}/api/v1/billing/alipay/notify"


def _return_url() -> str:
    return settings.frontend_page("/pages/settings/index", checkout="success", channel="alipay")


def _build_gateway_url(method: str, biz_content: dict[str, Any]) -> str:
    params = {
        "app_id": settings.alipay_app_id,
        "method": method,
        "format": "JSON",
        "charset": "utf-8",
        "sign_type": "RSA2",
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "version": "1.0",
        "notify_url": _notify_url(),
        "return_url": _return_url(),
        "biz_content": json.dumps(biz_content, ensure_ascii=False, separators=(",", ":")),
    }
    unsigned = "&".join(f"{k}={params[k]}" for k in sorted(params))
    params["sign"] = _sign_content(unsigned, settings.alipay_private_key)
    return f"{settings.alipay_gateway}?{urlencode(params, quote_via=quote_plus)}"


def _new_out_trade_no() -> str:
    return f"ali{uuid.uuid4().hex[:24]}"


async def create_alipay_payment(
    db: Session,
    user: User,
    pack_id: str,
    *,
    scene: str = "web",
    payment_terms_version: str | None = None,
) -> dict[str, Any]:
    product = get_product(pack_id)
    if not product:
        raise HTTPException(status_code=400, detail="Unknown product_id")

    amount_fen = product_amount_fen(product)
    out_trade_no = _new_out_trade_no()

    if not settings.alipay_enabled:
        register_pending_order(
            db,
            user_id=user.id,
            pack_id=pack_id,
            channel=f"alipay_{scene}",
            out_trade_no=out_trade_no,
            amount_fen=amount_fen,
            payment_terms_version=payment_terms_version,
        )
        if not settings.payment_mock_allowed:
            raise HTTPException(status_code=503, detail="支付宝未配置")
        result = fulfill_payment(db, user.id, pack_id, source="alipay_mock", external_id=out_trade_no)
        mark_order_paid(db, out_trade_no, out_trade_no)
        return {"mode": "mock", "pack_id": pack_id, "out_trade_no": out_trade_no, **result}

    biz = {
        "out_trade_no": out_trade_no,
        "product_code": "FAST_INSTANT_TRADE_PAY" if scene == "web" else "QUICK_WAP_WAY",
        "total_amount": f"{amount_fen / 100:.2f}",
        "subject": product["label"],
        "body": f"Vibe Sorcery · {product['label']}",
    }
    method = "alipay.trade.page.pay" if scene == "web" else "alipay.trade.wap.pay"
    pay_url = _build_gateway_url(method, biz)

    register_pending_order(
        db,
        user_id=user.id,
        pack_id=pack_id,
        channel=f"alipay_{scene}",
        out_trade_no=out_trade_no,
        amount_fen=amount_fen,
        payment_terms_version=payment_terms_version,
    )

    return {
        "mode": "alipay",
        "pack_id": pack_id,
        "out_trade_no": out_trade_no,
        "pay_url": pay_url,
        "scene": scene,
    }


def handle_alipay_notify(db: Session, form: dict[str, str]) -> str:
    if not settings.alipay_enabled:
        return "failure"

    sign = form.get("sign", "")
    verify_params = {k: v for k, v in form.items() if k not in ("sign", "sign_type") and v}
    unsigned = "&".join(f"{k}={verify_params[k]}" for k in sorted(verify_params))

    if settings.alipay_enabled and not _verify_content(unsigned, sign, settings.alipay_public_key):
        return "failure"

    if form.get("trade_status") not in ("TRADE_SUCCESS", "TRADE_FINISHED"):
        return "success"

    out_trade_no = form.get("out_trade_no", "")
    trade_no = form.get("trade_no", out_trade_no)

    from app.models.schemas import PaymentOrder
    from app.services.payment_security import validate_alipay_notify_fields

    row = db.query(PaymentOrder).filter(PaymentOrder.out_trade_no == out_trade_no).first()
    if not row:
        return "failure"

    err = validate_alipay_notify_fields(form, row)
    if err:
        if err == "order_expired":
            row.status = "expired"
            db.commit()
        return "failure"

    complete_paid_order(db, out_trade_no, provider_tx_id=trade_no, source="alipay")
    return "success"
