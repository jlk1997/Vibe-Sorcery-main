"""One-time WebSocket stream tickets — avoids putting JWT in query strings."""

from __future__ import annotations

import json
import secrets

import redis

from app.config import settings


def _client() -> redis.Redis:
    return redis.from_url(settings.redis_url, decode_responses=True)


def issue_stream_ticket(user_id: str, job_id: str, ttl: int | None = None) -> str:
    ttl = ttl or settings.ws_stream_ticket_ttl_seconds
    ticket = secrets.token_urlsafe(32)
    payload = json.dumps({"user_id": user_id, "job_id": job_id})
    _client().setex(f"ws:ticket:{ticket}", ttl, payload)
    return ticket


def consume_stream_ticket(ticket: str) -> tuple[str, str] | None:
    if not ticket:
        return None
    key = f"ws:ticket:{ticket}"
    client = _client()
    try:
        raw = client.getdel(key)
    except AttributeError:
        pipe = client.pipeline()
        pipe.get(key)
        pipe.delete(key)
        raw, _ = pipe.execute()
    if not raw:
        return None
    try:
        data = json.loads(raw)
        user_id = str(data["user_id"])
        job_id = str(data["job_id"])
    except (KeyError, TypeError, json.JSONDecodeError):
        return None
    return user_id, job_id
