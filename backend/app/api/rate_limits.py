"""Shared API rate-limit helpers."""

from __future__ import annotations

import hashlib
import uuid

from app.models.schemas import User
from app.services.redis_rate_limit import check_rate_limit

GENERATION_LIMIT_PER_MINUTE = 30
ANALYTICS_LIMIT_PER_MINUTE = 120
REGISTER_LIMIT_PER_MINUTE = 5
LOGIN_LIMIT_PER_IP = 15
LOGIN_LIMIT_PER_ACCOUNT = 10
BILLING_LIMIT_PER_USER = 10
WEBHOOK_LIMIT_PER_IP = 120


def _client_ip(request) -> str:
    return request.client.host if request.client else "unknown"


def check_generation_rate_limit(user: User) -> None:
    check_rate_limit(f"gen:{user.id}", limit=GENERATION_LIMIT_PER_MINUTE, window_seconds=60)


def check_register_rate_limit(request) -> None:
    check_rate_limit(f"register:{_client_ip(request)}", limit=REGISTER_LIMIT_PER_MINUTE, window_seconds=60)


def check_login_rate_limit(request, email: str | None = None) -> None:
    check_rate_limit(f"login:ip:{_client_ip(request)}", limit=LOGIN_LIMIT_PER_IP, window_seconds=60)
    if email:
        normalized = email.strip().lower()
        key = hashlib.sha256(normalized.encode()).hexdigest()[:16]
        check_rate_limit(f"login:acct:{key}", limit=LOGIN_LIMIT_PER_ACCOUNT, window_seconds=60)


def check_billing_rate_limit(user: User) -> None:
    check_rate_limit(f"billing:{user.id}", limit=BILLING_LIMIT_PER_USER, window_seconds=60)


def check_webhook_rate_limit(request) -> None:
    check_rate_limit(f"webhook:{_client_ip(request)}", limit=WEBHOOK_LIMIT_PER_IP, window_seconds=60)


def check_analytics_rate_limit(user_id: uuid.UUID | None, client_key: str = "anon") -> None:
    key = f"analytics:{user_id}" if user_id else f"analytics:{client_key}"
    check_rate_limit(key, limit=ANALYTICS_LIMIT_PER_MINUTE, window_seconds=60)
