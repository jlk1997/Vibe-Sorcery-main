import hashlib
import hmac
import json
import os
import sys
import tempfile
from typing import Any, Dict, List, Optional, Tuple

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../../.."))

from app.config import settings

try:
    from src.Listener import Listener
    from src.Evaluator import Evaluator
    from src.utils import mood_tags, genre_tags
except ImportError:
    Listener = None
    Evaluator = None
    mood_tags = []
    genre_tags = []


class EmotionEngine:
    """Wraps Essentia Listener + Evaluator for mood/genre/AV analysis."""

    def __init__(self, models_dir: str | None = None):
        self.models_dir = models_dir or settings.models_dir
        self._listener = None
        self._evaluator = None

    @property
    def listener(self):
        if self._listener is None and Listener is not None:
            self._listener = Listener(models_dir=self.models_dir)
        return self._listener

    @property
    def evaluator(self):
        if self._evaluator is None and Evaluator is not None:
            self._evaluator = Evaluator(models_dir=self.models_dir)
        return self._evaluator

    def analyze(self, audio_path: str) -> Dict[str, Any]:
        if self.listener is None:
            return {
                "moods": ["ambient"],
                "genres": ["electronic"],
                "arousal": 5.0,
                "valence": 5.0,
                "embedding": [],
            }

        moods, genres = self.listener.get_moods_and_genres(audio_path)
        arousal, valence = None, None
        embedding: List[float] = []

        if self.evaluator is not None:
            arousal, valence = self.evaluator.get_arousal_valence(audio_path)
            arousal, valence = float(arousal), float(valence)

        try:
            import numpy as np

            emb = self.listener._load_and_extract_embeddings(audio_path)
            embedding = np.mean(emb, axis=0).tolist() if len(emb) else []
        except Exception:
            embedding = []

        return {
            "moods": moods,
            "genres": genres,
            "arousal": arousal,
            "valence": valence,
            "embedding": embedding[:512],
        }

    def analyze_bytes(self, data: bytes, suffix: str = ".wav") -> Dict[str, Any]:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(data)
            path = tmp.name
        try:
            return self.analyze(path)
        finally:
            os.unlink(path)

    def get_tags(self) -> Dict[str, List[str]]:
        return {"mood_tags": mood_tags, "genre_tags": genre_tags}

    def infer_from_intent(
        self,
        text_intent: str | None = None,
        preset: dict | None = None,
        preference_moods: list[str] | None = None,
        preference_genres: list[str] | None = None,
    ) -> Dict[str, Any]:
        """Derive moods/genres/AV without audio — Intent-First default."""
        moods: list[str] = []
        genres: list[str] = []
        arousal, valence = 5.0, 5.0

        if preset:
            moods = list(preset.get("moods") or [])
            genres = list(preset.get("genres") or [])
            wps = preset.get("waypoint_template") or []
            if wps:
                arousal = float(wps[0].get("arousal", 5))
                valence = float(wps[0].get("valence", 5))

        if preference_moods and not moods:
            moods = list(preference_moods[:3])
        if preference_genres and not genres:
            genres = list(preference_genres[:3])

        text = (text_intent or "").lower()
        if text:
            keyword_moods = {
                "calm": "calm",
                "peace": "peaceful",
                "sad": "melancholic",
                "happy": "happy",
                "energy": "energetic",
                "dark": "dark",
                "hope": "hopeful",
                "night": "nostalgic",
                "focus": "focused",
            }
            keyword_genres = {
                "lo-fi": "lo-fi",
                "lofi": "lo-fi",
                "electronic": "electronic",
                "pop": "pop",
                "ambient": "ambient",
                "cinematic": "cinematic",
                "house": "house",
                "classical": "classical",
                "古典": "classical",
                "jazz": "jazz",
                "爵士": "jazz",
                "folk": "folk",
                "民谣": "folk",
                "rock": "rock",
                "摇滚": "rock",
                "blues": "blues",
                "蓝调": "blues",
            }
            instrument_genre_hints = {
                "violin": "classical",
                "小提琴": "classical",
                "saxophone": "jazz",
                "萨克斯": "jazz",
                "piano": "classical",
                "钢琴": "classical",
                "guitar": "folk",
                "吉他": "folk",
                "erhu": "folk",
                "二胡": "folk",
                "guzheng": "folk",
                "古筝": "folk",
            }
            for key, tag in keyword_moods.items():
                if key in text and tag not in moods:
                    moods.append(tag)
            for key, tag in keyword_genres.items():
                if key in text and tag not in genres:
                    genres.append(tag)
            for key, tag in instrument_genre_hints.items():
                if key in text and tag not in genres:
                    genres.append(tag)

        has_instrument_hint = any(
            k in text for k in ("小提琴", "violin", "萨克斯", "sax", "钢琴", "piano", "吉他", "guitar", "二胡", "古筝")
        )
        if not moods:
            moods = ["calm"] if (has_instrument_hint or genres) else ["ambient"]
        if not genres:
            genres = ["classical"] if has_instrument_hint else ["electronic"]

        return {
            "moods": moods[:5],
            "genres": genres[:5],
            "arousal": arousal,
            "valence": valence,
            "embedding": [],
        }

    def compute_metrics(self, av_pairs: List[Tuple[float, float]]) -> Dict[str, float]:
        if self.evaluator is None or len(av_pairs) < 2:
            return {}
        songs_data = [
            {"arousal": a, "valence": v} for a, v in av_pairs
        ]
        return self.evaluator._calculate_metrics(songs_data)


emotion_engine = EmotionEngine()
