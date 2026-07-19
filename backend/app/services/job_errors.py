"""Structured error codes for generation jobs (API + worker + i18n mapping)."""

from __future__ import annotations

import re
from typing import Any

# Stable codes consumed by the client i18n layer.
QUEUE_UNAVAILABLE = "QUEUE_UNAVAILABLE"
QUEUE_TIMEOUT = "QUEUE_TIMEOUT"
QUEUE_OVERLOAD = "QUEUE_OVERLOAD"
ACTIVE_JOB_LIMIT = "ACTIVE_JOB_LIMIT"
RATE_LIMITED = "RATE_LIMITED"
MINIMAX_RATE_LIMIT = "MINIMAX_RATE_LIMIT"
MINIMAX_BALANCE = "MINIMAX_BALANCE"
MINIMAX_CONTENT = "MINIMAX_CONTENT"
NETWORK_TIMEOUT = "NETWORK_TIMEOUT"
GENERATION_FAILED = "GENERATION_FAILED"
PARTIAL_PLAYLIST = "PARTIAL_PLAYLIST"
FORBIDDEN = "FORBIDDEN"
NOT_FOUND = "NOT_FOUND"
VALIDATION = "VALIDATION"

_MINIMAX_CODE_MAP: dict[int, str] = {
    1002: MINIMAX_RATE_LIMIT,
    1008: MINIMAX_BALANCE,
    1026: MINIMAX_CONTENT,
    1027: MINIMAX_CONTENT,
    1001: NETWORK_TIMEOUT,
    # 2056: Token Plan 用量上限 / 需升级套餐或购买积分（服务商额度耗尽）
    2056: MINIMAX_BALANCE,
}


def error_code_from_minimax_code(code: int) -> str | None:
    return _MINIMAX_CODE_MAP.get(code)


def extract_minimax_code(message: str) -> int | None:
    for pattern in (r"\[code=(\d+)\]", r"\[(\d+)\]"):
        m = re.search(pattern, message)
        if m:
            return int(m.group(1))
    return None


def classify_error_message(message: str, *, partial: bool = False) -> str:
    """Map a human-readable error message to a stable error_code."""
    if partial:
        return PARTIAL_PLAYLIST
    msg = (message or "").strip()
    if not msg:
        return GENERATION_FAILED

    lowered = msg.lower()
    if "排队超时" in msg or "queue timeout" in lowered:
        return QUEUE_TIMEOUT
    if "队列不可用" in msg or "queue unavailable" in lowered:
        return QUEUE_UNAVAILABLE
    if "队列繁忙" in msg or "queue overload" in lowered:
        return QUEUE_OVERLOAD
    if "rate limit" in lowered or "过于频繁" in msg or "速率限制" in msg:
        if "api rate" in lowered:
            return RATE_LIMITED
        return MINIMAX_RATE_LIMIT
    if (
        "余额不足" in msg
        or "balance" in lowered
        or "用量上限" in msg
        or "token plan" in lowered
        or "购买积分" in msg
    ):
        return MINIMAX_BALANCE
    if "审核" in msg or "涉敏" in msg:
        return MINIMAX_CONTENT
    if any(token in lowered for token in ("timeout", "disconnected", "connection", "network", "proxy", "连接中断")):
        return NETWORK_TIMEOUT
    if msg.startswith("MiniMax"):
        code = extract_minimax_code(msg)
        if code is not None:
            mapped = error_code_from_minimax_code(code)
            if mapped:
                return mapped
    if "forbidden" in lowered or "无权" in msg:
        return FORBIDDEN
    if "not found" in lowered or "不存在" in msg:
        return NOT_FOUND
    return GENERATION_FAILED


def classify_exception(exc: Exception, *, partial: bool = False) -> tuple[str, str]:
    """Return (error_code, error_message) for an exception."""
    msg = str(exc).strip() or "生成失败，请稍后重试"
    code = classify_error_message(msg, partial=partial)
    return code, msg


def log_job_failure(logger: Any, job_id: str, error_code: str, error_message: str, **extra: Any) -> None:
    logger.warning(
        "Job failed job_id=%s error_code=%s message=%s extra=%s",
        job_id,
        error_code,
        error_message[:200],
        extra or None,
    )
