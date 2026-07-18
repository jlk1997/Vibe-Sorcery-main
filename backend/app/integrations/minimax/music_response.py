import base64
import json
import logging
from typing import Any

from app.core.music_prompt_builder import (
    MusicCreativeSpec,
    apply_built_prompt_hint,
    build_minimax_prompt,
)
from app.integrations.minimax.http_utils import get_bytes_with_retry, minimax_timeout

logger = logging.getLogger(__name__)

MINIMAX_STATUS_HINTS: dict[int, str] = {
    1000: "MiniMax 服务异常，请稍后重试",
    1001: "MiniMax 请求超时，请稍后重试",
    1002: "MiniMax 请求过于频繁（速率限制），请稍后再试",
    1004: "MiniMax API Key 无效或未授权",
    1008: "MiniMax 账户余额不足，请前往 MiniMax 控制台充值",
    1024: "MiniMax 内部错误，请稍后重试",
    1026: "MiniMax 内容审核未通过，请修改描述后重试",
    1027: "MiniMax 输出内容涉敏，请修改描述后重试",
    1033: "MiniMax 下游服务异常，请稍后重试",
    2151: "MiniMax 音乐生成准备失败，请稍后重试",
    2013: "MiniMax 请求参数无效",
    2049: "MiniMax API Key 无效",
}

# Transient server-side failures — safe to retry or fall back to non-stream.
MINIMAX_RETRYABLE_STATUS_CODES = frozenset({1000, 1001, 1002, 1024, 1033, 2045, 2151})


def minimax_status_error(code: int, status_msg: str | None = None) -> RuntimeError:
    hint = MINIMAX_STATUS_HINTS.get(code)
    detail = (status_msg or "").strip()
    if hint and detail and detail.lower() not in hint.lower():
        return RuntimeError(f"{hint}（{detail}）[code={code}]")
    if hint:
        return RuntimeError(f"{hint} [code={code}]")
    if detail:
        return RuntimeError(f"MiniMax 错误 [{code}]：{detail}")
    return RuntimeError(f"MiniMax 错误码 {code}")


def is_retryable_minimax_error(exc: Exception) -> bool:
    msg = str(exc)
    if any(token in msg for token in ("余额不足", "API Key", "未授权", "审核", "参数无效", "涉敏")):
        return False
    if "准备失败" in msg or "稍后重试" in msg:
        return True
    for code in MINIMAX_RETRYABLE_STATUS_CODES:
        if f"[code={code}]" in msg or f"[{code}]" in msg:
            return True
    return False


def _try_parse_json_object(text: str) -> dict[str, Any] | None:
    stripped = (text or "").strip()
    if not stripped or not stripped.startswith("{"):
        return None
    try:
        parsed = json.loads(stripped)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _response_preview(content: str, limit: int = 320) -> str:
    compact = " ".join((content or "").split())
    if len(compact) <= limit:
        return compact
    return compact[:limit] + "…"


def extract_audio_field(data: dict[str, Any]) -> str:
    """MiniMax music_generation: audio URL or hex lives in data.audio (not extra_info)."""
    block = data.get("data")
    if isinstance(block, dict):
        audio = block.get("audio") or block.get("audio_url") or ""
        if audio:
            return str(audio)

    for key in ("audio", "audio_url"):
        if data.get(key):
            return str(data[key])

    extra = data.get("extra_info")
    if isinstance(extra, dict):
        audio = extra.get("audio") or extra.get("audio_url") or ""
        if audio:
            return str(audio)
    return ""


def validate_music_response(data: dict[str, Any]) -> None:
    base = data.get("base_resp") or {}
    code = base.get("status_code", 0)
    if code != 0:
        raise minimax_status_error(code, base.get("status_msg"))

    block = data.get("data")
    if isinstance(block, dict):
        status = block.get("status")
        if status is not None and status != 2:
            raise RuntimeError(f"音乐生成未完成 (status={status})，请稍后重试")


async def resolve_music_audio_bytes(
    data: dict[str, Any],
    *,
    output_format: str,
) -> tuple[str, bytes]:
    """Parse MiniMax music_generation response → (audio_url, audio_bytes)."""
    validate_music_response(data)
    audio_field = extract_audio_field(data)
    if not audio_field:
        logger.error("MiniMax music response missing audio field: keys=%s", list(data.keys()))
        raise RuntimeError("MiniMax 响应中未包含音频数据")

    if audio_field.startswith("http://") or audio_field.startswith("https://"):
        audio_bytes = await get_bytes_with_retry(
            audio_field,
            timeout=minimax_timeout(180.0),
            endpoint="audio_download",
        )
        return audio_field, audio_bytes

    if audio_field.startswith("data:"):
        try:
            b64 = audio_field.split(",", 1)[1]
            return "", base64.b64decode(b64)
        except (IndexError, ValueError) as exc:
            raise RuntimeError("MiniMax 返回的 data URL 音频无法解析") from exc

    # output_format=hex (official default) — data.audio is hex-encoded mp3/wav
    if output_format == "url":
        logger.warning(
            "MiniMax returned non-URL audio with output_format=url, attempting hex decode"
        )
    try:
        audio_bytes = bytes.fromhex(audio_field)
    except ValueError as exc:
        raise RuntimeError("MiniMax 返回的音频 hex 无法解码") from exc

    if not audio_bytes:
        raise RuntimeError("MiniMax 返回空音频数据")
    return "", audio_bytes



def compose_music_prompt(
    *,
    style_tags: str | None = None,
    built_prompt: str | None = None,
    text_intent: str | None = None,
    bpm: int | None = None,
    key: str | None = None,
    creative_spec: MusicCreativeSpec | None = None,
) -> str:
    """
    MiniMax 官方两步成曲 + 音色配方合并。
    始终保留 text_intent 与用户乐器/风格约束。
    """
    spec = creative_spec or MusicCreativeSpec()
    if style_tags and style_tags.strip():
        spec = spec.model_copy(update={"style_tags": style_tags.strip()})
    if text_intent and text_intent.strip():
        merged_text = text_intent.strip()
        if spec.text_intent and merged_text not in spec.text_intent:
            merged_text = f"{spec.text_intent} {merged_text}".strip()
        spec = spec.model_copy(update={"text_intent": merged_text})
    if bpm is not None:
        spec = spec.model_copy(update={"bpm": bpm})
    if key and str(key).lower() not in ("auto", ""):
        spec = spec.model_copy(update={"key": str(key)})
    spec = apply_built_prompt_hint(spec, built_prompt)
    return build_minimax_prompt(spec)


def apply_music_request_format(payload: dict[str, Any], *, use_stream: bool, output_format: str) -> dict[str, Any]:
    """MiniMax streaming only supports hex output."""
    out = dict(payload)
    if use_stream:
        out["stream"] = True
        out["output_format"] = "hex"
    else:
        out["output_format"] = output_format
        out.pop("stream", None)
    return out


def parse_music_sse_text(content: str) -> tuple[bytes, dict[str, Any]]:
    """Parse MiniMax music_generation SSE (stream=true) into final audio bytes."""
    chunk_parts: list[str] = []
    final_hex = ""
    extra_info: dict[str, Any] = {}
    last_payload: dict[str, Any] = {}
    saw_sse = False

    for raw_line in (content or "").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if not line.startswith("data:"):
            fallback = _try_parse_json_object(line)
            if fallback:
                last_payload = fallback
            continue
        saw_sse = True
        payload_text = line[5:].strip()
        if not payload_text or payload_text == "[DONE]":
            continue
        try:
            payload = json.loads(payload_text)
        except json.JSONDecodeError:
            continue

        last_payload = payload if isinstance(payload, dict) else {}
        base = last_payload.get("base_resp") or {}
        code = base.get("status_code", 0)
        if code != 0:
            raise minimax_status_error(code, base.get("status_msg"))

        if isinstance(last_payload.get("extra_info"), dict):
            extra_info = last_payload["extra_info"]

        block = last_payload.get("data")
        if not isinstance(block, dict):
            continue

        audio = block.get("audio") or ""
        status = block.get("status")
        if not audio:
            continue
        if status == 2:
            final_hex = str(audio)
        elif status == 1:
            chunk_parts.append(str(audio))

    if not saw_sse and not last_payload:
        last_payload = _try_parse_json_object(content) or {}

    if last_payload:
        base = last_payload.get("base_resp") or {}
        code = base.get("status_code", 0)
        if code != 0:
            trace_id = last_payload.get("trace_id")
            logger.warning(
                "MiniMax music SSE ended with error code=%s msg=%s trace_id=%s preview=%s",
                code,
                base.get("status_msg"),
                trace_id,
                _response_preview(content),
            )
            raise minimax_status_error(code, base.get("status_msg"))

    hex_str = final_hex or "".join(chunk_parts)
    if not hex_str:
        logger.error(
            "MiniMax SSE stream missing audio (lines=%s, saw_sse=%s, preview=%s)",
            len((content or "").splitlines()),
            saw_sse,
            _response_preview(content),
        )
        raise RuntimeError(
            "MiniMax 流式响应中未包含音频数据。"
            "常见原因：API 速率限制（连续生成多首时）、MiniMax 服务端偶发异常，或账户余额不足。"
            "请稍后重试；若频繁出现，请检查 MiniMax 控制台余额与 RPM 限制。"
        )

    try:
        audio_bytes = bytes.fromhex(hex_str)
    except ValueError as exc:
        raise RuntimeError("MiniMax 返回的音频 hex 无法解码") from exc

    if not audio_bytes:
        raise RuntimeError("MiniMax 返回空音频数据")

    return audio_bytes, {"extra_info": extra_info, "response": last_payload}
