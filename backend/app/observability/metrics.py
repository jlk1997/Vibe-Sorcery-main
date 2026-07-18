"""Lightweight Prometheus-style metrics and request timing."""

from __future__ import annotations

import time
from collections import defaultdict
from threading import Lock

_lock = Lock()
_request_count = defaultdict(int)
_request_latency_sum = defaultdict(float)
_error_count = defaultdict(int)


def record_request(path: str, method: str, status_code: int, duration_ms: float) -> None:
    key = f"{method}:{path}"
    with _lock:
        _request_count[key] += 1
        _request_latency_sum[key] += duration_ms
        if status_code >= 500:
            _error_count[key] += 1


def prometheus_text() -> str:
    lines: list[str] = []
    with _lock:
        for key, count in sorted(_request_count.items()):
            method, path = key.split(":", 1)
            safe = path.replace('"', '\\"')
            lines.append(f'http_requests_total{{method="{method}",path="{safe}"}} {count}')
            avg = _request_latency_sum[key] / count if count else 0
            lines.append(f'http_request_duration_ms_avg{{method="{method}",path="{safe}"}} {avg:.2f}')
        for key, count in sorted(_error_count.items()):
            method, path = key.split(":", 1)
            safe = path.replace('"', '\\"')
            lines.append(f'http_errors_total{{method="{method}",path="{safe}"}} {count}')
    return "\n".join(lines) + "\n"


class MetricsMiddleware:
    """Starlette middleware recording request metrics."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        start = time.perf_counter()
        status_holder = {"code": 500}

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                status_holder["code"] = message["status"]
            await send(message)

        await self.app(scope, receive, send_wrapper)
        path = scope.get("path", "")
        if path.startswith("/api/"):
            # Collapse dynamic segments for cardinality
            parts = path.split("/")
            normalized = []
            for p in parts:
                if len(p) == 36 and p.count("-") == 4:
                    normalized.append("{id}")
                else:
                    normalized.append(p)
            norm_path = "/".join(normalized)
            duration_ms = (time.perf_counter() - start) * 1000
            record_request(norm_path, scope.get("method", "GET"), status_holder["code"], duration_ms)
