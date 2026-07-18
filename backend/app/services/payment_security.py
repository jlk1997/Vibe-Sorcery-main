"""Payment notify validation — amount, merchant, order state."""

from __future__ import annotations

import logging
from datetime import datetime

from app.config import settings
from app.models.schemas import PaymentOrder

logger = logging.getLogger(__name__)


def assert_order_payable(row: PaymentOrder | None) -> str | None:
    """Return skip reason if order must not be fulfilled; None if OK."""
    if not row:
        return "order_not_found"
    if row.status == "paid":
        return "already_paid"
    if row.status != "pending":
        return f"invalid_status:{row.status}"
    if row.expires_at and row.expires_at <= datetime.utcnow():
        return "order_expired"
    return None


def validate_wechat_notify_fields(data: dict, row: PaymentOrder) -> str | None:
    """Return error reason or None if valid."""
    skip = assert_order_payable(row)
    if skip:
        return skip

    appid = data.get("appid", "")
    mch_id = data.get("mch_id", "")
    if settings.wechat_app_id and appid and appid != settings.wechat_app_id:
        return "appid_mismatch"
    if settings.wechat_pay_mch_id and mch_id and mch_id != settings.wechat_pay_mch_id:
        return "mch_id_mismatch"

    try:
        total_fee = int(data.get("total_fee") or 0)
    except (TypeError, ValueError):
        return "invalid_total_fee"
    if total_fee != row.amount_fen:
        logger.warning(
            "WeChat amount mismatch out_trade_no=%s expected=%s got=%s",
            row.out_trade_no,
            row.amount_fen,
            total_fee,
        )
        return "amount_mismatch"
    return None


def validate_alipay_notify_fields(form: dict[str, str], row: PaymentOrder) -> str | None:
    """Return error reason or None if valid."""
    skip = assert_order_payable(row)
    if skip:
        return skip

    app_id = form.get("app_id", "")
    if settings.alipay_app_id and app_id and app_id != settings.alipay_app_id:
        return "app_id_mismatch"

    try:
        total_yuan = float(form.get("total_amount") or 0)
        total_fen = int(round(total_yuan * 100))
    except (TypeError, ValueError):
        return "invalid_total_amount"
    if total_fen != row.amount_fen:
        logger.warning(
            "Alipay amount mismatch out_trade_no=%s expected=%s got=%s",
            row.out_trade_no,
            row.amount_fen,
            total_fen,
        )
        return "amount_mismatch"
    return None
