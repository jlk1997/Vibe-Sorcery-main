"""Template-based caption fallback when MiniMax M3 is unavailable."""
import random
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[3]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

try:
    from src.Captioner import Captioner
except ImportError:
    Captioner = None


def build_template_prompt(
    moods: list[str],
    genres: list[str],
    bpm: int = 90,
    *,
    text_intent: str | None = None,
    creative_spec: "MusicCreativeSpec | None" = None,
) -> dict:
    from app.core.music_prompt_builder import MusicCreativeSpec, build_minimax_prompt

    spec = creative_spec or MusicCreativeSpec(moods=moods, genres=genres, bpm=bpm)
    if text_intent and text_intent.strip():
        spec = spec.model_copy(update={"text_intent": text_intent.strip()})
    if spec.instruments or spec.genres or spec.text_intent:
        prompt = build_minimax_prompt(spec)
        return {
            "prompt": prompt,
            "bpm": spec.bpm or bpm,
            "key": spec.key if spec.key != "auto" else "C minor",
            "mood_direction": "continue",
            "source": "creative_spec",
        }

    if Captioner is not None:
        captioner = Captioner()
        prompt = captioner.generate_caption(genres or ["electronic"], moods or ["ambient"])
    else:
        prompt = f"{', '.join((genres or ['electronic'])[:2])} instrumental, {', '.join((moods or ['ambient'])[:3])}"

    keys = ["C minor", "D minor", "E minor", "A minor", "G major", "F major"]
    return {
        "prompt": f"{prompt}, {bpm} BPM, {random.choice(keys)}, high quality instrumental",
        "bpm": bpm,
        "key": random.choice(keys),
        "mood_direction": "continue",
        "source": "template_captioner",
    }
