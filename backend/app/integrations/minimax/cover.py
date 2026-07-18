import logging
import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.config import settings
from app.integrations.minimax.http_utils import minimax_timeout, post_json_with_retry
from app.integrations.minimax.music_generation import request_music_audio
from app.integrations.minimax.music_response import extract_audio_field, validate_music_response
from app.models.schemas import ApiUsageLog

logger = logging.getLogger(__name__)


class MiniMaxCoverClient:
    """MiniMax music-cover — 一步/两步翻唱（官方 /music_generation + /music_cover_preprocess）。"""

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or settings.minimax_api_key
        self.base_url = settings.minimax_api_base.rstrip("/")
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def _audio_setting(self) -> dict:
        return {
            "sample_rate": settings.minimax_music_sample_rate,
            "bitrate": settings.minimax_music_bitrate,
            "format": settings.minimax_music_format,
        }

    def _extract_audio_url(self, data: dict) -> str:
        return extract_audio_field(data)

    def _check_base_resp(self, data: dict) -> None:
        validate_music_response(data)

    async def preprocess_cover(
        self,
        reference_audio_url: str,
        db: Session | None = None,
        user_id: str | None = None,
    ) -> dict[str, Any]:
        """两步翻唱步骤1：提取 cover_feature_id 与 formatted_lyrics（免费）。"""
        if settings.use_mock_ai:
            return {
                "cover_feature_id": "mock-feature-id",
                "formatted_lyrics": "[Verse]\nMock lyrics for development",
                "audio_duration": 120,
            }

        payload = {
            "model": settings.minimax_music_cover_model,
            "audio_url": reference_audio_url,
        }
        data = await post_json_with_retry(
            f"{self.base_url}/music_cover_preprocess",
            headers=self.headers,
            payload=payload,
            timeout=minimax_timeout(settings.minimax_music_timeout_seconds),
            endpoint="/music_cover_preprocess",
        )

        self._check_base_resp(data)
        if db and user_id:
            db.add(
                ApiUsageLog(
                    user_id=uuid.UUID(user_id),
                    provider="minimax",
                    model=settings.minimax_music_cover_model,
                    endpoint="/music_cover_preprocess",
                    extra_data={"reference": reference_audio_url[:80]},
                )
            )
            db.commit()

        info = data.get("data") or data
        return {
            "cover_feature_id": info.get("cover_feature_id"),
            "formatted_lyrics": info.get("formatted_lyrics") or info.get("lyrics"),
            "structure_result": info.get("structure_result"),
            "audio_duration": info.get("audio_duration"),
            "raw": data,
        }

    async def generate_cover(
        self,
        reference_audio_url: str,
        prompt: str,
        lyrics: str | None = None,
        cover_mode: str | None = None,
        modified_lyrics: str | None = None,
        db: Session | None = None,
        user_id: str | None = None,
    ) -> dict[str, Any]:
        mode = cover_mode or settings.minimax_cover_mode_default

        if settings.use_mock_ai:
            return {
                "audio_url": reference_audio_url,
                "task_id": "mock-cover",
                "model": settings.minimax_music_cover_model,
                "prompt": prompt,
                "cover_mode": mode,
            }

        payload: dict[str, Any] = {
            "model": settings.minimax_music_cover_model,
            "prompt": prompt[:300],
            "audio_setting": self._audio_setting(),
        }

        if mode == "two_step":
            pre = await self.preprocess_cover(reference_audio_url, db=db, user_id=user_id)
            feature_id = pre.get("cover_feature_id")
            if not feature_id:
                raise RuntimeError("Cover preprocess did not return cover_feature_id")
            payload["cover_feature_id"] = feature_id
            payload["lyrics"] = modified_lyrics or lyrics or pre.get("formatted_lyrics") or ""
            if len(payload["lyrics"]) < 10:
                raise RuntimeError("Two-step cover requires lyrics (min 10 chars)")
        else:
            # 一步翻唱：参考音频 + 风格描述，歌词自动 ASR 提取
            payload["audio_url"] = reference_audio_url
            if lyrics:
                payload["lyrics"] = lyrics

        audio_bytes, audio_url, data, _stream_used = await request_music_audio(
            base_url=self.base_url,
            headers=self.headers,
            base_payload=payload,
            endpoint_label="/music_generation(cover)",
        )

        if db and user_id:
            db.add(
                ApiUsageLog(
                    user_id=uuid.UUID(user_id),
                    provider="minimax",
                    model=settings.minimax_music_cover_model,
                    endpoint="/music_generation",
                    extra_data={"cover_mode": mode, "prompt_length": len(prompt)},
                )
            )
            db.commit()

        return {
            "audio_url": audio_url or extract_audio_field(data),
            "audio_bytes": audio_bytes,
            "task_id": str(data.get("trace_id") or data.get("task_id") or ""),
            "model": settings.minimax_music_cover_model,
            "prompt": prompt,
            "cover_mode": mode,
            "raw": data,
        }


cover_client = MiniMaxCoverClient()
