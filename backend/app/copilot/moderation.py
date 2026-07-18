"""Lightweight Copilot input moderation."""

from __future__ import annotations

import re

MAX_MESSAGE_LEN = 2000

_BLOCKED = re.compile(
    r"(密码|api[_\s]?key|secret|token\s*[:=]|删库|drop\s+table|ignore\s+previous\s+instructions)",
    re.IGNORECASE,
)


def moderate_copilot_input(message: str) -> str | None:
    """Return error message if input should be rejected, else None."""
    text = (message or "").strip()
    if not text:
        return "消息不能为空"
    if len(text) > MAX_MESSAGE_LEN:
        return f"消息过长（最多 {MAX_MESSAGE_LEN} 字）"
    if _BLOCKED.search(text):
        return "消息包含不允许的内容"
    return None
