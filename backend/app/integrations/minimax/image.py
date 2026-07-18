import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.config import settings
from app.integrations.minimax.http_utils import (
    get_bytes_with_retry,
    minimax_timeout,
    post_json_with_retry,
)
from app.models.schemas import ApiUsageLog


class MiniMaxImageClient:
    """MiniMax image generation for work covers."""

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or settings.minimax_api_key
        self.base_url = settings.minimax_api_base
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def generate_cover_image(
        self,
        prompt: str,
        aspect_ratio: str = "1:1",
        db: Session | None = None,
        user_id: str | None = None,
    ) -> dict[str, Any]:
        if settings.use_mock_ai:
            return {
                "image_url": "",
                "image_bytes": None,
                "prompt": prompt,
                "model": "mock-image",
            }

        payload = {
            "model": settings.minimax_image_model,
            "prompt": prompt,
            "aspect_ratio": aspect_ratio,
            "n": 1,
        }

        data = await post_json_with_retry(
            f"{self.base_url}/image_generation",
            headers=self.headers,
            payload=payload,
            timeout=minimax_timeout(120.0),
            endpoint="/image_generation",
        )

        if db and user_id:
            log = ApiUsageLog(
                user_id=uuid.UUID(user_id),
                provider="minimax",
                model=settings.minimax_image_model,
                endpoint="/image_generation",
                extra_data={"prompt_length": len(prompt)},
            )
            db.add(log)
            db.commit()

        images = data.get("data", {}).get("image_urls", []) or data.get("images", [])
        image_url = images[0] if images else ""
        image_bytes = None
        if image_url:
            image_bytes = await get_bytes_with_retry(
                image_url,
                timeout=minimax_timeout(60.0),
                endpoint="image_download",
            )

        return {
            "image_url": image_url,
            "image_bytes": image_bytes,
            "prompt": prompt,
            "model": settings.minimax_image_model,
        }


image_client = MiniMaxImageClient()
