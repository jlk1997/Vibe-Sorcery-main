"""Helpers for Celery generation tasks."""


class PartialPlaylistError(RuntimeError):
    """Raised when a playlist job saved partial tracks before failing."""


def friendly_generation_error(exc: Exception) -> str:
    msg = str(exc).strip()
    if not msg:
        return "生成失败，请稍后重试"
    if msg.startswith("MiniMax"):
        return msg
    lowered = msg.lower()
    if any(
        token in lowered
        for token in (
            "remoteprotocol",
            "disconnected",
            "timeout",
            "connection",
            "network",
            "proxy",
        )
    ):
        return (
            "音乐生成服务连接中断或超时（通常需 1–3 分钟）。"
            "请检查网络；若开启 VPN/代理，在 .env 设置 MINIMAX_HTTP_TRUST_ENV=false 并重启 Celery Worker。"
        )
    return msg


def friendly_generation_error_with_code(exc: Exception, *, partial: bool = False) -> tuple[str, str]:
    from app.services.job_errors import classify_exception

    return classify_exception(exc, partial=partial)
