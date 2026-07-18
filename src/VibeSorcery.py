import os
from typing import Dict, List, Optional, Union

from src.Captioner import Captioner
from src.Listener import Listener
from src.generators.base import GenerationResult, MusicGenerator
from src.generators.stable_audio import StableAudioGenerator
from src.provenance import (
    build_emotion_snapshot,
    build_provenance_record,
    export_provenance_json,
)


class VibeSorcery:
    """
    Generates a mood-based playlist using a Markov chain:
    each track depends only on the immediately preceding track.
    """

    def __init__(
        self,
        models_dir: str = "models",
        output_dir: str = "playlist",
        device: str | None = None,
        generator: MusicGenerator | None = None,
        include_evaluator: bool = False,
    ):
        self.models_dir = models_dir
        self.output_dir = output_dir
        self.device = device

        os.makedirs(models_dir, exist_ok=True)
        os.makedirs(output_dir, exist_ok=True)

        self.listener = Listener(models_dir=models_dir)
        self.captioner = Captioner()
        self.generator = generator or StableAudioGenerator(
            device=device, output_dir=output_dir
        )
        self.evaluator = None
        if include_evaluator:
            from src.Evaluator import Evaluator

            self.evaluator = Evaluator(models_dir=models_dir)

        self.playlist: List[Dict] = []
        self.provenance: List[Dict] = []

    def _get_arousal_valence(self, song_path: str) -> tuple[float | None, float | None]:
        if self.evaluator is None:
            return None, None
        arousal, valence = self.evaluator.get_arousal_valence(song_path)
        return float(arousal), float(valence)

    def generate_next_song(
        self,
        input_song_path: str,
        duration: float = 47.0,
        seed: Optional[int] = None,
        step: int = 1,
        parent_file_path: Optional[str] = None,
    ) -> Dict:
        moods, genres = self.listener.get_moods_and_genres(input_song_path)
        arousal, valence = self._get_arousal_valence(input_song_path)
        caption = self.captioner.generate_caption(genres, moods)

        result = self.generator.generate_song(
            prompt=caption,
            duration=duration,
            seed=seed,
        )

        if result is None:
            raise RuntimeError("Music generation failed")

        emotion_snapshot = build_emotion_snapshot(moods, genres, arousal, valence)
        provenance_record = build_provenance_record(
            step=step,
            record_type="generated",
            emotion_snapshot=emotion_snapshot,
            caption=caption,
            generation_result=result,
            parent_file_path=parent_file_path or input_song_path,
            seed=seed,
        )
        self.provenance.append(provenance_record)

        song_info = {
            "file_path": result.file_path,
            "caption": caption,
            "moods": moods,
            "genres": genres,
            "duration": duration,
            "seed": result.seed,
            "provenance": provenance_record,
        }
        if arousal is not None:
            song_info["arousal"] = arousal
            song_info["valence"] = valence

        self.playlist.append(song_info)
        return song_info

    def generate_playlist(
        self,
        input_song_path: str,
        num_songs: int = 5,
        duration: float = 47.0,
        seed: Optional[int] = None,
        export_provenance_path: Optional[str] = None,
    ) -> List[Dict]:
        self.playlist = []
        self.provenance = []

        if not os.path.exists(input_song_path):
            raise FileNotFoundError(f"No song: {input_song_path}")

        seed_moods, seed_genres = self.listener.get_moods_and_genres(input_song_path)
        seed_arousal, seed_valence = self._get_arousal_valence(input_song_path)
        seed_record = build_provenance_record(
            step=0,
            record_type="seed",
            emotion_snapshot=build_emotion_snapshot(
                seed_moods, seed_genres, seed_arousal, seed_valence
            ),
            caption="",
            duration=duration,
        )
        seed_record["output"] = {"file_path": input_song_path}
        self.provenance.append(seed_record)

        last_song = self.generate_next_song(
            input_song_path,
            duration,
            seed,
            step=1,
            parent_file_path=input_song_path,
        )

        for i in range(1, num_songs):
            print(f"Generating song {i + 1}/{num_songs}...")
            last_song = self.generate_next_song(
                last_song["file_path"],
                duration,
                seed,
                step=i + 1,
                parent_file_path=last_song["file_path"],
            )

        if export_provenance_path:
            export_provenance_json(self.provenance, export_provenance_path)
        elif self.output_dir:
            default_path = os.path.join(self.output_dir, "provenance.json")
            export_provenance_json(self.provenance, default_path)

        print("Vibe Sorcery completed!")
        print(f"Playlist generated with {len(self.playlist)} songs.")
        return self.playlist

    def get_playlist_info(self) -> Dict:
        if not self.playlist:
            return {"status": "Empty", "message": "No playlist was generated."}

        total_duration = sum(song.get("duration", 0) for song in self.playlist)
        unique_moods = set()
        for song in self.playlist:
            if "moods" in song:
                unique_moods.update(song["moods"])

        return {
            "num_songs": len(self.playlist),
            "total_duration_seconds": total_duration,
            "total_duration_formatted": f"{int(total_duration // 60)}:{int(total_duration % 60):02d}",
            "unique_moods": list(unique_moods),
            "songs": [
                {
                    "file": os.path.basename(song["file_path"]),
                    "caption": song["caption"],
                    "moods": song["moods"][:3],
                }
                for song in self.playlist
            ],
            "provenance_count": len(self.provenance),
        }

    def get_provenance(self) -> List[Dict]:
        return self.provenance
