"""Structured JSON logging helpers."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger("vibe.structured")


def log_event(event: str, **fields: Any) -> None:
    payload = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "event": event,
        **{k: v for k, v in fields.items() if v is not None},
    }
    logger.info(json.dumps(payload, ensure_ascii=False, default=str))


def log_generation_job(
    *,
    job_id: str,
    user_id: str,
    job_type: str,
    status: str,
    credits_charged: int | None = None,
    duration_ms: float | None = None,
    error: str | None = None,
) -> None:
    log_event(
        "generation_job",
        job_id=job_id,
        user_id=user_id,
        job_type=job_type,
        status=status,
        credits_charged=credits_charged,
        duration_ms=duration_ms,
        error=error,
    )
