"""SSRF-safe URL validation for outbound webhooks."""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

_BLOCKED_HOSTNAMES = frozenset(
    {
        "localhost",
        "metadata.google.internal",
        "metadata.goog",
    }
)


def assert_safe_webhook_url(url: str) -> str:
    """Raise ValueError if URL is not a safe public http(s) endpoint."""
    parsed = urlparse(url.strip())
    if parsed.scheme not in ("http", "https"):
        raise ValueError("Webhook URL must use http or https")
    if parsed.username or parsed.password:
        raise ValueError("Webhook URL must not contain credentials")
    host = (parsed.hostname or "").lower().rstrip(".")
    if not host:
        raise ValueError("Webhook URL must include a host")
    if host in _BLOCKED_HOSTNAMES:
        raise ValueError("Webhook URL host is not allowed")
    if host.endswith(".local") or host.endswith(".internal"):
        raise ValueError("Webhook URL host is not allowed")

    # Literal IP in URL
    try:
        ip = ipaddress.ip_address(host)
        if not _is_public_ip(ip):
            raise ValueError("Webhook URL must not target private or internal networks")
        return url.strip()
    except ValueError as exc:
        if "does not appear to be an IPv4 or IPv6 address" not in str(exc):
            raise

    # Resolve hostname — block private/reserved targets
    try:
        infos = socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme == "https" else 80))
    except socket.gaierror as exc:
        raise ValueError("Webhook URL host could not be resolved") from exc

    if not infos:
        raise ValueError("Webhook URL host could not be resolved")

    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not _is_public_ip(ip):
            raise ValueError("Webhook URL must not target private or internal networks")

    return url.strip()


def _is_public_ip(ip: ipaddress._BaseAddress) -> bool:
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )
