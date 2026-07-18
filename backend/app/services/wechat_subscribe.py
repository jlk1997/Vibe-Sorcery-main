"""WeChat mini-program subscribe message helpers (template IDs configured via env)."""

from __future__ import annotations

import logging
import uuid

from sqlalchemy.orm import Session

from app.config import settings

logger = logging.getLogger(__name__)


def _send_subscribe_message(*, openid: str, template_id: str, data: dict[str, str]) -> bool:
    """Send WeChat subscribe message when credentials and template are configured."""
    if not template_id or not settings.wechat_app_id or not getattr(settings, "wechat_app_secret", None):
        logger.info("wechat_subscribe skipped (missing tpl/app credentials) openid=%s tpl=%s", openid, template_id)
        return False
    try:
        import httpx

        token_resp = httpx.get(
            "https://api.weixin.qq.com/cgi-bin/token",
            params={
                "grant_type": "client_credential",
                "appid": settings.wechat_app_id,
                "secret": settings.wechat_app_secret,
            },
            timeout=8,
        )
        token_resp.raise_for_status()
        access_token = token_resp.json().get("access_token")
        if not access_token:
            return False
        payload = {
            "touser": openid,
            "template_id": template_id,
            "data": {k: {"value": v} for k, v in data.items()},
        }
        send_resp = httpx.post(
            f"https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token={access_token}",
            json=payload,
            timeout=8,
        )
        send_resp.raise_for_status()
        body = send_resp.json()
        if body.get("errcode", 0) != 0:
            logger.warning("wechat_subscribe send failed: %s", body)
            return False
        return True
    except Exception:
        logger.exception("wechat_subscribe send failed")
        return False


def _template_ids() -> dict[str, str]:
    return {
        "job_complete": getattr(settings, "wechat_tpl_job_complete", "") or "",
        "low_credits": getattr(settings, "wechat_tpl_low_credits", "") or "",
        "creator_weekly": getattr(settings, "wechat_tpl_creator_weekly", "") or "",
    }


def try_notify_job_complete(db: Session, owner_id: uuid.UUID, *, work_title: str | None = None) -> bool:
    """Best-effort subscribe message when a generation job completes."""
    tpl = _template_ids().get("job_complete")
    if not tpl or not settings.wechat_app_id:
        return False
    try:
        from app.models.schemas import User, WeChatUser

        user = db.query(User).filter(User.id == owner_id).first()
        if not user:
            return False
        wx = db.query(WeChatUser).filter(WeChatUser.user_id == owner_id).first()
        if not wx or not wx.openid:
            return False
        return _send_subscribe_message(
            openid=wx.openid,
            template_id=tpl,
            data={"thing1": (work_title or "作品")[:20], "phrase2": "生成完成"},
        )
    except Exception:
        logger.exception("wechat_subscribe job_complete failed")
        return False


def try_notify_low_credits(db: Session, user_id: uuid.UUID, balance: int) -> bool:
    tpl = _template_ids().get("low_credits")
    if not tpl or balance >= 5:
        return False
    try:
        from app.models.schemas import WeChatUser

        wx = db.query(WeChatUser).filter(WeChatUser.user_id == user_id).first()
        if not wx or not wx.openid:
            return False
        logger.info("wechat_subscribe low_credits user=%s balance=%s tpl=%s", user_id, balance, tpl)
        return True
    except Exception:
        logger.exception("wechat_subscribe low_credits failed")
        return False


def try_notify_creator_weekly(db: Session, user_id: uuid.UUID, *, message: str) -> bool:
    """Best-effort subscribe message for creator weekly digest."""
    tpl = _template_ids().get("creator_weekly")
    if not tpl or not settings.wechat_app_id:
        return False
    try:
        from app.models.schemas import WeChatUser

        wx = db.query(WeChatUser).filter(WeChatUser.user_id == user_id).first()
        if not wx or not wx.openid:
            return False
        return _send_subscribe_message(
            openid=wx.openid,
            template_id=tpl,
            data={"thing1": message[:20]},
        )
    except Exception:
        logger.exception("wechat_subscribe creator_weekly failed")
        return False
