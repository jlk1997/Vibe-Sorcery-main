"""Growth engine — user referral codes and invite rewards."""

from __future__ import annotations

import re
import uuid

from sqlalchemy.orm import Session

from app.config import settings
from app.models.schemas import CreditTransaction, User
from app.services.credits import grant_credits_with_transaction


def _normalize_code(code: str) -> str:
    return re.sub(r"[^A-Za-z0-9]", "", (code or "").strip()).upper()


def generate_referral_code(username: str, suffix: str = "") -> str:
    base = re.sub(r"[^A-Za-z0-9]", "", (username or "").lower())[:6].upper() or "VIBE"
    tail = suffix or uuid.uuid4().hex[:4].upper()
    return f"{base}{tail}"[:12]


def ensure_referral_code(db: Session, user: User) -> str:
    if user.referral_code:
        return user.referral_code
    for _ in range(8):
        candidate = generate_referral_code(user.username)
        exists = db.query(User.id).filter(User.referral_code == candidate).first()
        if not exists:
            user.referral_code = candidate
            db.flush()
            return candidate
    fallback = uuid.uuid4().hex[:10].upper()
    user.referral_code = fallback
    db.flush()
    return fallback


def apply_referral_on_signup(db: Session, user: User, referral_code: str | None) -> dict | None:
    """Link invitee to referrer and grant both parties credits once."""
    if not settings.referral_enabled:
        return None
    code = _normalize_code(referral_code or "")
    if not code:
        return None

    referrer = db.query(User).filter(User.referral_code == code).first()
    if not referrer or referrer.id == user.id:
        return None

    user.referred_by_id = referrer.id
    db.flush()

    invitee_bonus = settings.referral_credits_invitee
    referrer_bonus = settings.referral_credits_referrer

    if invitee_bonus > 0:
        grant_credits_with_transaction(
            db,
            user.id,
            invitee_bonus,
            source="referral_invitee",
            external_id=f"referral_invitee:{user.id}",
            commit=False,
        )

    if referrer_bonus > 0:
        grant_credits_with_transaction(
            db,
            referrer.id,
            referrer_bonus,
            source="referral_referrer",
            external_id=f"referral_referrer:{referrer.id}:{user.id}",
            commit=False,
        )

    return {
        "referrer_username": referrer.username,
        "invitee_bonus": invitee_bonus,
        "referrer_bonus": referrer_bonus,
    }


def get_referral_stats(db: Session, user: User) -> dict:
    had_code = bool(user.referral_code)
    code = ensure_referral_code(db, user)
    if not had_code and user.referral_code:
        db.commit()

    invitees = db.query(User).filter(User.referred_by_id == user.id).count()
    from sqlalchemy import func

    credits_earned = (
        db.query(func.coalesce(func.sum(CreditTransaction.credits), 0))
        .filter(
            CreditTransaction.user_id == user.id,
            CreditTransaction.source == "referral_referrer",
        )
        .scalar()
    ) or 0

    return {
        "referral_code": code,
        "invites_count": invitees,
        "credits_earned": credits_earned,
        "referrer_reward": settings.referral_credits_referrer,
        "invitee_reward": settings.referral_credits_invitee,
        "share_url": f"/pages/login/index?ref={code}",
    }
