"""Startup and health check tests."""

import pytest

from app.startup_checks import validate_production_config


def test_startup_allows_debug_defaults(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "debug", True)
    monkeypatch.setattr(settings, "jwt_secret", "change-me-in-production")
    validate_production_config()


def test_startup_rejects_default_jwt_in_production(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "debug", False)
    monkeypatch.setattr(settings, "jwt_secret", "change-me-in-production")
    monkeypatch.setattr(settings, "stripe_secret_key", "")
    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        validate_production_config()


def test_health_collects_checks():
    from app.health import collect_health

    result = collect_health()
    assert "status" in result
    assert "checks" in result
    assert "database" in result["checks"]
    assert "redis" in result["checks"]
    assert "essentia_models" in result["checks"]
