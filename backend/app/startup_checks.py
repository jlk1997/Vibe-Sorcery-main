"""Production startup validation — fail fast when misconfigured."""

from __future__ import annotations

import logging

from app.config import settings

log = logging.getLogger("vibe.startup")

_DEFAULT_JWT_SECRET = "change-me-in-production"


def validate_production_config() -> None:
    """Raise RuntimeError when critical secrets are missing in non-debug mode."""
    if settings.debug:
        if settings.jwt_secret == _DEFAULT_JWT_SECRET:
            log.warning("JWT_SECRET is default — set a strong secret in production")
        if settings.stripe_secret_key and not settings.stripe_webhook_secret:
            log.warning(
                "STRIPE_SECRET_KEY is set but STRIPE_WEBHOOK_SECRET is empty — webhooks will be rejected"
            )
        if not settings.admin_bootstrap_email.strip():
            log.info("ADMIN_BOOTSTRAP_EMAIL is empty — no automatic admin promotion on startup")
        return

    errors: list[str] = []
    if settings.jwt_secret == _DEFAULT_JWT_SECRET or len(settings.jwt_secret) < 32:
        errors.append("JWT_SECRET must be set to a strong random value (32+ chars) when DEBUG=false")
    if settings.stripe_secret_key and not settings.stripe_webhook_secret:
        errors.append("STRIPE_WEBHOOK_SECRET is required when STRIPE_SECRET_KEY is set")
    if not settings.rate_limit_fail_closed:
        log.warning(
            "RATE_LIMIT_FAIL_CLOSED is false — rate limits fall back to per-process memory when Redis is down"
        )
    if errors:
        raise RuntimeError("Production configuration invalid:\n- " + "\n- ".join(errors))
