"""Backward-compatible wrapper. Prefer src.generators.stable_audio.StableAudioGenerator."""
from src.generators.stable_audio import StableAudioGenerator as Generator

__all__ = ["Generator"]
