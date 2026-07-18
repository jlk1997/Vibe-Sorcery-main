"""MiniMax Music 2.6 generator adapter for local/CLI pipeline."""
import os
from typing import Any, Optional

from src.generators.base import GenerationResult, MusicGenerator


class MiniMaxMusicGenerator(MusicGenerator):
    """Sync wrapper around MiniMax music API for CLI usage."""

    def __init__(self, output_dir: str = "playlist", api_key: str | None = None):
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)
        self.api_key = api_key or os.environ.get("MINIMAX_API_KEY", "")

    def generate_song(
        self,
        prompt: str,
        duration: float = 120.0,
        seed: Optional[int] = None,
        filename: Optional[str] = None,
        is_instrumental: bool = True,
        **kwargs: Any,
    ) -> Optional[GenerationResult]:
        import asyncio
        import httpx

        async def _run():
            from app.integrations.minimax.client import MiniMaxClient

            client = MiniMaxClient(api_key=self.api_key)
            result = await client.generate_music(
                prompt=prompt,
                is_instrumental=is_instrumental,
                seed=seed,
            )
            if not result.audio_bytes:
                return None

            ext = "mp3"
            if filename is None:
                files = [f for f in os.listdir(self.output_dir) if f.startswith("playlist_song_")]
                idx = len(files) + 1
                filename = f"playlist_song_{idx}.{ext}"
            filepath = os.path.join(self.output_dir, filename)
            with open(filepath, "wb") as f:
                f.write(result.audio_bytes)

            return GenerationResult(
                file_path=filepath,
                prompt=prompt,
                duration=duration,
                seed=seed,
                model=result.model,
                provider="minimax",
                metadata={"format": ext, "task_id": result.task_id},
            )

        try:
            return asyncio.run(_run())
        except Exception as e:
            print(f"MiniMax generation failed: {e}")
            return None
