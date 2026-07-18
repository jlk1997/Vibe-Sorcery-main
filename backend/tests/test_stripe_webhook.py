import hashlib
import hmac
import json
import time

import pytest
from fastapi import HTTPException

from app.config import settings
from app.services import billing as billing_service


def test_stripe_webhook_rejects_bad_signature(monkeypatch):
    monkeypatch.setattr(settings, "stripe_webhook_secret", "whsec_test")
    payload = json.dumps({"type": "checkout.session.completed"}).encode()
    with pytest.raises(HTTPException) as exc:
        billing_service.verify_stripe_webhook_payload(payload, "t=1,v1=bad")
    assert exc.value.status_code == 400


def test_stripe_webhook_accepts_valid_signature(monkeypatch):
    secret = "whsec_test"
    monkeypatch.setattr(settings, "stripe_secret_key", "")
    monkeypatch.setattr(settings, "stripe_webhook_secret", secret)
    monkeypatch.setattr(settings, "stripe_webhook_tolerance_seconds", 600)
    payload = b'{"type":"ping"}'
    ts = str(int(time.time()))
    signed = f"{ts}.{payload.decode()}"
    sig = hmac.new(secret.encode(), signed.encode(), hashlib.sha256).hexdigest()
    header = f"t={ts},v1={sig}"
    event = billing_service.verify_stripe_webhook_payload(payload, header)
    assert event["type"] == "ping"


def test_stripe_webhook_requires_secret_when_stripe_enabled(monkeypatch):
    monkeypatch.setattr(settings, "stripe_secret_key", "sk_test")
    monkeypatch.setattr(settings, "stripe_webhook_secret", "")
    with pytest.raises(HTTPException) as exc:
        billing_service.verify_stripe_webhook_payload(b'{"type":"ping"}', None)
    assert exc.value.status_code == 503
