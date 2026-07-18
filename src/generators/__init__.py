from src.generators.base import GenerationResult, MusicGenerator
from src.generators.stable_audio import StableAudioGenerator

try:
    from src.generators.minimax_music import MiniMaxMusicGenerator
except ImportError:
    MiniMaxMusicGenerator = None

__all__ = ["GenerationResult", "MusicGenerator", "StableAudioGenerator", "MiniMaxMusicGenerator"]
