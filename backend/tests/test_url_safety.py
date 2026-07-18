import pytest

from app.services.url_safety import assert_safe_webhook_url


def test_rejects_non_http_scheme():
    with pytest.raises(ValueError, match="http"):
        assert_safe_webhook_url("ftp://example.com/hook")


def test_rejects_localhost():
    with pytest.raises(ValueError):
        assert_safe_webhook_url("http://localhost/hook")


def test_rejects_private_ip_literal():
    with pytest.raises(ValueError):
        assert_safe_webhook_url("http://127.0.0.1/hook")


def test_rejects_credentials_in_url():
    with pytest.raises(ValueError, match="credentials"):
        assert_safe_webhook_url("http://user:pass@example.com/hook")


def test_accepts_public_https():
    url = assert_safe_webhook_url("https://example.com/webhooks/vibe")
    assert url.startswith("https://")
