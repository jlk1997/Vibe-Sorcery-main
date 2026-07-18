import json
import logging
import uuid
from dataclasses import dataclass
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.config import settings
from app.core.music_prompt_builder import MusicCreativeSpec, apply_built_prompt_hint, build_minimax_prompt
from app.core.prompt.template_captioner import build_template_prompt
from app.integrations.minimax.http_utils import (
    get_bytes_with_retry,
    get_chat_client,
    minimax_request_slot,
    minimax_timeout,
    post_json_with_retry,
)
from app.integrations.minimax.music_generation import request_music_audio
from app.integrations.minimax.music_response import (
    compose_music_prompt,
    extract_audio_field,
    validate_music_response,
)
from app.models.schemas import ApiUsageLog

logger = logging.getLogger(__name__)

JOURNEY_CURVES = {
    "calm_to_energy": {"start": (3.0, 5.0), "end": (7.5, 7.0)},
    "sad_to_hope": {"start": (3.0, 3.0), "end": (6.0, 7.5)},
    "chaos_to_order": {"start": (8.0, 4.0), "end": (4.0, 6.0)},
    "neutral": {"start": (5.0, 5.0), "end": (5.0, 5.0)},
}


@dataclass
class LyricsGenerationResult:
    lyrics: str
    style_tags: str | None = None
    song_title: str | None = None


@dataclass
class MusicGenerationResult:
    audio_url: str
    audio_bytes: bytes | None
    task_id: str
    prompt: str
    lyrics: str | None
    seed: int | None
    model: str
    metadata: Dict[str, Any]


class MiniMaxClient:
    def __init__(self, api_key: str | None = None, base_url: str | None = None):
        self.api_key = api_key or settings.minimax_api_key
        self.base_url = (base_url or settings.minimax_api_base).rstrip("/")
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def _log_usage(
        self,
        db: Session | None,
        user_id: str | None,
        model: str,
        endpoint: str,
        metadata: Dict[str, Any],
        tokens_used: int = 0,
    ):
        if db is None:
            return
        log = ApiUsageLog(
            user_id=uuid.UUID(user_id) if user_id else None,
            provider="minimax",
            model=model,
            endpoint=endpoint,
            tokens_used=tokens_used,
            extra_data=metadata,
        )
        db.add(log)
        db.commit()

    def _extract_audio_url(self, data: dict) -> str:
        return extract_audio_field(data)

    def _check_base_resp(self, data: dict) -> None:
        validate_music_response(data)

    async def chat_completion(
        self,
        messages: list[dict],
        model: str | None = None,
        response_format: str = "text",
        db: Session | None = None,
        user_id: str | None = None,
    ) -> str:
        if settings.use_mock_ai:
            return messages[-1]["content"] if messages else "{}"

        model = model or settings.minimax_chat_model
        payload = {
            "model": model,
            "messages": messages,
        }
        if response_format == "json":
            payload["response_format"] = {"type": "json_object"}

        data = await post_json_with_retry(
            f"{self.base_url}/text/chatcompletion_v2",
            headers=self.headers,
            payload=payload,
            timeout=minimax_timeout(settings.minimax_chat_timeout_seconds),
            endpoint="chatcompletion_v2",
        )

        self._log_usage(
            db,
            user_id,
            model,
            "/text/chatcompletion_v2",
            {"messages_count": len(messages)},
            tokens_used=data.get("usage", {}).get("total_tokens", 0),
        )

        choices = data.get("choices", [])
        if choices:
            return choices[0].get("message", {}).get("content", "")
        return data.get("reply", "")

    async def chat_completion_stream(
        self,
        messages: list[dict],
        model: str | None = None,
        db: Session | None = None,
        user_id: str | None = None,
    ):
        """Yield incremental text deltas from MiniMax chat (SSE when available)."""
        if settings.use_mock_ai:
            text = messages[-1]["content"] if messages else ""
            if len(text) > 120:
                text = text[:120] + "…"
            fallback = text or "好的，我已根据你的需求整理了创作建议。"
            step = 8
            for i in range(0, len(fallback), step):
                yield fallback[i : i + step]
            return

        model = model or settings.minimax_chat_model
        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
        }

        async with minimax_request_slot():
            client = get_chat_client()
            async with client.stream(
                "POST",
                f"{self.base_url}/text/chatcompletion_v2",
                headers=self.headers,
                json=payload,
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    raw = line[5:].strip()
                    if not raw or raw == "[DONE]":
                        continue
                    try:
                        data = json.loads(raw)
                    except Exception:
                        continue
                    choices = data.get("choices") or []
                    if not choices:
                        continue
                    delta = choices[0].get("delta") or choices[0].get("message") or {}
                    piece = delta.get("content") or delta.get("text") or ""
                    if piece:
                        yield piece
                    if choices[0].get("finish_reason"):
                        break

        self._log_usage(
            db,
            user_id,
            model,
            "/text/chatcompletion_v2(stream)",
            {"messages_count": len(messages), "stream": True},
        )

    async def generate_lyrics(
        self,
        theme: str,
        moods: list[str] | None = None,
        language: str = "zh",
        db: Session | None = None,
        user_id: str | None = None,
    ) -> LyricsGenerationResult:
        """官方 POST /lyrics_generation — mode=write_full_song + prompt（见 MiniMax 文档）。"""
        if settings.use_mock_ai:
            return LyricsGenerationResult(
                lyrics=f"[Verse]\n{theme}\n{moods or ''}\n[Chorus]\nEmotional journey",
                style_tags=", ".join(moods[:3]) if moods else "Pop, Emotional",
                song_title=theme[:40] if theme else "Untitled",
            )

        prompt_parts = [theme.strip()]
        if moods:
            prompt_parts.append(", ".join(moods[:5]))
        if language and language.lower().startswith("en"):
            prompt_parts.append("English lyrics")
        elif language and language.lower().startswith("zh"):
            prompt_parts.append("中文歌词")
        prompt = "，".join(p for p in prompt_parts if p)[:2000]

        payload = {
            "mode": "write_full_song",
            "prompt": prompt or theme[:2000],
        }

        try:
            data = await post_json_with_retry(
                f"{self.base_url}/lyrics_generation",
                headers=self.headers,
                payload=payload,
                timeout=minimax_timeout(settings.minimax_chat_timeout_seconds),
                endpoint="/lyrics_generation",
            )
            self._check_base_resp(data)
            lyrics = data.get("lyrics")
            if not lyrics and isinstance(data.get("data"), dict):
                block = data["data"]
                lyrics = block.get("lyrics")
            if lyrics:
                extra: Dict[str, Any] = {"theme": theme[:100]}
                style_tags = data.get("style_tags")
                song_title = data.get("song_title")
                if style_tags:
                    extra["style_tags"] = style_tags
                if song_title:
                    extra["song_title"] = song_title
                self._log_usage(db, user_id, "lyrics-generation", "/lyrics_generation", extra)
                return LyricsGenerationResult(
                    lyrics=str(lyrics),
                    style_tags=str(style_tags) if style_tags else None,
                    song_title=str(song_title) if song_title else None,
                )
        except Exception as exc:
            logger.warning("lyrics_generation API failed, falling back to M3: %s", exc)

        system = (
            "Write structured song lyrics with [Verse], [Chorus], [Bridge] tags. "
            "Return plain text lyrics only."
        )
        user_msg = f"Theme: {theme}. Moods: {', '.join(moods or [])}. Language: {language}"
        fallback_lyrics = await self.chat_completion(
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user_msg}],
            db=db,
            user_id=user_id,
        )
        return LyricsGenerationResult(lyrics=fallback_lyrics)

    async def generate_music(
        self,
        prompt: str,
        lyrics: str | None = None,
        is_instrumental: bool = True,
        lyrics_optimizer: bool | None = None,
        seed: int | None = None,
        audio_format: str | None = None,
        sample_rate: int | None = None,
        bitrate: int | None = None,
        db: Session | None = None,
        user_id: str | None = None,
        mock_audio_bytes: bytes | None = None,
    ) -> MusicGenerationResult:
        if settings.use_mock_ai:
            return MusicGenerationResult(
                audio_url="",
                audio_bytes=mock_audio_bytes,
                task_id="mock-dev",
                prompt=prompt,
                lyrics=lyrics,
                seed=seed,
                model="mock-dev",
                metadata={"mock": True},
            )

        use_optimizer = (
            settings.minimax_lyrics_optimizer_default
            if lyrics_optimizer is None
            else lyrics_optimizer
        )
        if is_instrumental:
            # 纯音乐：官方要求 prompt 必填；lyrics_optimizer 仅用于有人声且无歌词场景
            use_optimizer = False
        elif not lyrics and use_optimizer:
            use_optimizer = True

        prompt = (prompt or "").strip()
        if is_instrumental and not prompt:
            prompt = "ambient emotional instrumental, layered atmosphere, cinematic"

        base_payload: Dict[str, Any] = {
            "model": settings.minimax_music_model,
            "prompt": prompt[:2000],
            "is_instrumental": is_instrumental,
            "audio_setting": {
                "sample_rate": sample_rate or settings.minimax_music_sample_rate,
                "bitrate": bitrate or settings.minimax_music_bitrate,
                "format": audio_format or settings.minimax_music_format,
            },
        }
        if not is_instrumental:
            base_payload["lyrics_optimizer"] = use_optimizer
        if lyrics:
            base_payload["lyrics"] = lyrics[:3500]
        elif not is_instrumental and not use_optimizer:
            raise RuntimeError("有人声音乐生成需要 lyrics，或开启 lyrics_optimizer")

        audio_bytes, audio_url, data, stream_used = await request_music_audio(
            base_url=self.base_url,
            headers=self.headers,
            base_payload=base_payload,
            endpoint_label="/music_generation",
        )

        self._log_usage(
            db,
            user_id,
            settings.minimax_music_model,
            "/music_generation",
            {
                "prompt_length": len(prompt),
                "instrumental": is_instrumental,
                "lyrics_optimizer": use_optimizer,
                "stream": stream_used,
            },
        )

        task_id = str(data.get("trace_id") or data.get("task_id") or "")

        return MusicGenerationResult(
            audio_url=audio_url,
            audio_bytes=audio_bytes,
            task_id=task_id,
            prompt=prompt,
            lyrics=lyrics,
            seed=seed,
            model=settings.minimax_music_model,
            metadata={"response": data, "stream": stream_used},
        )

    async def build_music_prompt(
        self,
        moods: list[str],
        genres: list[str],
        step: int,
        total_steps: int,
        target_curve: str = "calm_to_energy",
        bpm_range: tuple[int, int] = (80, 120),
        key: str = "auto",
        instrumental: bool = True,
        target_av: tuple[float, float] | None = None,
        text_intent: str | None = None,
        creative_spec: MusicCreativeSpec | None = None,
        db: Session | None = None,
        user_id: str | None = None,
    ) -> dict:
        spec = creative_spec or MusicCreativeSpec(
            moods=moods,
            genres=genres,
            bpm_range=[bpm_range[0], bpm_range[1]] if bpm_range else None,
            key=key or "auto",
            text_intent=text_intent or "",
        )
        use_direct = bool(
            spec.instruments
            or spec.genres
            or spec.style_tags
            or spec.moods
            or (text_intent and total_steps == 1 and step == 1)
            or (total_steps == 1 and step == 1 and spec.has_user_constraints())
        )
        if use_direct:
            direct_prompt = build_minimax_prompt(spec)
            return {
                "prompt": direct_prompt,
                "bpm": spec.bpm or (bpm_range[0] if bpm_range else 90),
                "key": spec.key if spec.key != "auto" else "auto",
                "mood_direction": "user_spec",
                "source": "direct_spec",
            }

        if settings.use_mock_ai:
            bpm = bpm_range[0] if bpm_range else 90
            return build_template_prompt(moods, genres, bpm=bpm, text_intent=text_intent, creative_spec=spec)

        curve = JOURNEY_CURVES.get(target_curve, JOURNEY_CURVES["calm_to_energy"])
        payload: Dict[str, Any] = {
            "moods": moods,
            "genres": genres,
            "step": step,
            "total_steps": total_steps,
            "journey_start_av": curve["start"],
            "journey_end_av": curve["end"],
            "bpm_range": list(bpm_range),
            "key_preference": key,
            "instrumental": instrumental,
        }
        if target_av:
            payload["target_av"] = list(target_av)
        if text_intent:
            payload["text_intent"] = text_intent
        if spec.instruments:
            payload["required_instruments"] = spec.instruments
        if spec.genres:
            payload["required_genres"] = spec.genres

        system = (
            "You are a music prompt engineer for MiniMax music-2.6. "
            "Return ONLY valid JSON with keys: prompt (string, max 500 chars), "
            "bpm (int), key (string like 'E minor'), mood_direction (string). "
            "NEVER remove instruments or genres listed in required_instruments/required_genres/text_intent. "
            "Only add journey dynamics for this step; keep user style anchors intact."
        )
        user_msg = json.dumps(payload, ensure_ascii=False)
        raw = await self.chat_completion(
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_msg},
            ],
            response_format="json",
            db=db,
            user_id=user_id,
        )
        try:
            data = json.loads(raw)
            hinted = apply_built_prompt_hint(spec, data.get("prompt"))
            data["prompt"] = build_minimax_prompt(hinted)
            data["source"] = "m3_journey"
            return data
        except json.JSONDecodeError:
            return build_template_prompt(
                moods,
                genres,
                bpm=bpm_range[0],
                text_intent=text_intent,
                creative_spec=spec,
            )

    async def plan_journey(
        self,
        text_intent: str,
        steps: int = 6,
        db: Session | None = None,
        user_id: str | None = None,
    ) -> dict:
        system = (
            "Plan an emotional music journey. Return ONLY valid JSON with keys: "
            "title (string), target_curve (one of calm_to_energy, sad_to_hope, chaos_to_order), "
            "steps (int), waypoints (list of {step, arousal, valence, description})."
        )
        raw = await self.chat_completion(
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": text_intent},
            ],
            response_format="json",
            db=db,
            user_id=user_id,
        )
        try:
            plan = json.loads(raw)
            plan.setdefault("steps", steps)
            return plan
        except json.JSONDecodeError:
            return {
                "title": "Emotional Journey",
                "target_curve": "calm_to_energy",
                "steps": steps,
                "waypoints": [],
            }

    async def polish_text_intent(
        self,
        text_intent: str,
        db: Session | None = None,
        user_id: str | None = None,
    ) -> str:
        raw = text_intent.strip()
        if settings.use_mock_ai:
            if len(raw) < 24:
                return f"{raw}，层次渐进的氛围铺陈，适合深夜独处的呼吸感纯音乐"
            return raw

        system = (
            "你是音乐创作助手。用户给出一句简陋的音乐创作意图，请润色成更有画面感、"
            "更适合 AI 音乐生成的中文描述。保持一句或两句，不超过 120 字。"
            "只返回润色后的文本，不要解释、不要引号、不要标题。"
        )
        polished = await self.chat_completion(
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": raw},
            ],
            db=db,
            user_id=user_id,
        )
        cleaned = polished.strip().strip('"').strip("'").strip("「").strip("」")
        return cleaned[:300] if cleaned else raw

    async def remix_prompt(
        self,
        original_prompt: str,
        user_intent: str,
        db: Session | None = None,
        user_id: str | None = None,
    ) -> dict:
        system = "Rewrite the music generation prompt based on user remix intent. Return JSON: {prompt, bpm, key}."
        raw = await self.chat_completion(
            messages=[
                {"role": "system", "content": system},
                {
                    "role": "user",
                    "content": json.dumps(
                        {"original_prompt": original_prompt, "remix_intent": user_intent}
                    ),
                },
            ],
            response_format="json",
            db=db,
            user_id=user_id,
        )
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {"prompt": f"{original_prompt}, {user_intent}", "bpm": 100, "key": "auto"}


minimax_client = MiniMaxClient()
