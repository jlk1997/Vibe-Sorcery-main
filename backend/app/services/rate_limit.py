"""API rate limiting — Redis sliding window with in-process fallback."""

from app.services.redis_rate_limit import (  # noqa: F401
    DEFAULT_LIMIT,
    DEFAULT_WINDOW_SECONDS,
    check_rate_limit,
)
