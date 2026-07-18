import pytest

from app.integrations.minimax.music_response import (
    apply_music_request_format,
    extract_audio_field,
    parse_music_sse_text,
    validate_music_response,
)


def test_extract_audio_from_data_block():
    data = {
        "trace_id": "abc",
        "data": {"status": 2, "audio": "https://cdn.example.com/track.mp3"},
        "extra_info": {"music_duration": 120.0, "bitrate": 256000},
        "base_resp": {"status_code": 0, "status_msg": "success"},
    }
    assert extract_audio_field(data) == "https://cdn.example.com/track.mp3"


def test_extract_audio_not_from_extra_info_only():
    data = {
        "data": {"status": 2, "audio": "fffb9064"},
        "extra_info": {"music_duration": 60.0},
        "base_resp": {"status_code": 0},
    }
    assert extract_audio_field(data) == "fffb9064"


def test_validate_rejects_incomplete_status():
    data = {
        "data": {"status": 1, "audio": ""},
        "base_resp": {"status_code": 0},
    }
    with pytest.raises(RuntimeError, match="status=1"):
        validate_music_response(data)


def test_apply_music_request_format_stream():
    payload = apply_music_request_format({"prompt": "test"}, use_stream=True, output_format="url")
    assert payload["stream"] is True
    assert payload["output_format"] == "hex"


def test_parse_music_sse_final_chunk():
    chunk_a = b"ID3\x04\x00mp3-a"
    chunk_b = b"mp3-b"
    final_hex = (chunk_a + chunk_b).hex()
    content = "\n\n".join(
        [
            f'data: {{"data": {{"status": 1, "audio": "{chunk_a.hex()}"}}, "base_resp": {{"status_code": 0}}}}',
            f'data: {{"data": {{"status": 2, "audio": "{final_hex}"}}, "base_resp": {{"status_code": 0}}, "extra_info": {{"music_duration": 12.5}}}}',
            "",
        ]
    )
    audio_bytes, meta = parse_music_sse_text(content)
    assert audio_bytes == chunk_a + chunk_b
    assert meta["extra_info"]["music_duration"] == 12.5


def test_parse_music_sse_plain_json_rate_limit():
    content = '{"base_resp": {"status_code": 1002, "status_msg": "rate limit"}}'
    with pytest.raises(RuntimeError, match="速率限制"):
        parse_music_sse_text(content)


def test_parse_music_sse_preparation_failure_includes_code():
    content = '{"base_resp": {"status_code": 1033, "status_msg": "音乐生成准备失败，请稍后重试"}, "trace_id": "abc123"}'
    with pytest.raises(RuntimeError, match=r"\[code=1033\]"):
        parse_music_sse_text(content)


def test_compose_music_prompt_prefers_style_tags():
    from app.integrations.minimax.music_response import compose_music_prompt

    prompt = compose_music_prompt(
        style_tags="Mandopop, Festive, Upbeat",
        built_prompt="calm piano, 90 BPM",
        text_intent="新年歌曲",
        bpm=120,
        key="C major",
    )
    assert "Mandopop" in prompt
    assert "120 BPM" in prompt
    assert "C major" in prompt


def test_compose_music_prompt_fallback_to_intent():
    from app.integrations.minimax.music_response import compose_music_prompt

    assert compose_music_prompt(text_intent="rainy night blues") == "rainy night blues"


def test_is_retryable_minimax_error():
    from app.integrations.minimax.music_response import is_retryable_minimax_error

    assert is_retryable_minimax_error(RuntimeError("MiniMax 错误 [1033]：音乐生成准备失败"))
    assert is_retryable_minimax_error(RuntimeError("MiniMax 音乐生成准备失败，请稍后重试 [code=2151]"))
    assert not is_retryable_minimax_error(RuntimeError("MiniMax 账户余额不足 [code=1008]"))


def test_parse_music_sse_plain_json_insufficient_balance():
    content = '{"base_resp": {"status_code": 1008, "status_msg": "insufficient balance"}}'
    with pytest.raises(RuntimeError, match="余额不足"):
        parse_music_sse_text(content)
