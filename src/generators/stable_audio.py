import os
from typing import Any, Optional

import soundfile as sf
import torch
from diffusers import StableAudioPipeline

from src.generators.base import GenerationResult, MusicGenerator


class StableAudioGenerator(MusicGenerator):
    """Generates music via Stable Audio Open 1.0 (local GPU/CPU)."""

    def __init__(
        self,
        model_name: str = "stabilityai/stable-audio-open-1.0",
        device: str | None = None,
        output_dir: str = "playlist",
    ):
        self.model_name = model_name
        if device is None:
            self.device = (
                "cuda"
                if torch.cuda.is_available()
                else "mps"
                if torch.backends.mps.is_available()
                else "cpu"
            )
        else:
            self.device = device

        print(f"Using device: {self.device}")
        self.output_dir = output_dir
        os.makedirs(self.output_dir, exist_ok=True)

        try:
            self.pipe = StableAudioPipeline.from_pretrained(
                self.model_name,
                torch_dtype=torch.float16 if self.device == "cuda" else torch.float32,
            )
            self.pipe = self.pipe.to(self.device)
            print(f"Model {self.model_name} loaded on {self.device}")
        except Exception as e:
            print(f"Error loading model: {e}")
            self.pipe = None

    def generate_song(
        self,
        prompt: str,
        duration: float = 47.0,
        seed: Optional[int] = None,
        filename: Optional[str] = None,
        negative_prompt: str = "Low quality, noise, distortion, artifacts",
        **kwargs: Any,
    ) -> Optional[GenerationResult]:
        if self.pipe is None:
            print("No model loaded.")
            return None

        try:
            if seed is not None:
                gen = torch.Generator(self.device).manual_seed(seed)
            else:
                seed = torch.randint(0, 1000000, (1,)).item()
                gen = torch.Generator(self.device).manual_seed(seed)

            audio = self.pipe(
                prompt=prompt,
                negative_prompt=negative_prompt,
                audio_end_in_s=duration,
                num_waveforms_per_prompt=1,
                generator=gen,
            ).audios

            output = audio[0].T.float().cpu().numpy()

            if filename is None:
                files = [
                    f
                    for f in os.listdir(self.output_dir)
                    if f.startswith("playlist_song_") and f.endswith(".wav")
                ]
                if files:
                    last_number = max(
                        int(f.split("_")[-1].split(".")[0]) for f in files
                    )
                    filename = f"playlist_song_{last_number + 1}.wav"
                else:
                    filename = "playlist_song_1.wav"

            filepath = os.path.join(self.output_dir, filename)
            sf.write(filepath, output, self.pipe.vae.sampling_rate)
            print(f"Song generated in: {filepath}")

            return GenerationResult(
                file_path=filepath,
                prompt=prompt,
                duration=duration,
                seed=seed,
                model=self.model_name,
                provider="stable-audio",
                metadata={"negative_prompt": negative_prompt, "format": "wav"},
            )
        except Exception as e:
            print(f"Error generating song: {e}")
            return None
