"""Intent-first and preset tests."""

from app.core.emotion_engine import emotion_engine
from app.core.style_presets import apply_preset, get_preset


def test_infer_from_intent_with_preset():
    preset = get_preset("lo-fi-night")
    result = emotion_engine.infer_from_intent("calm night lo-fi", preset=preset)
    assert "lo-fi" in result["genres"] or "ambient" in result["moods"]
    assert result["arousal"] is not None


def test_apply_preset_scales_waypoints():
    applied = apply_preset("energy-rise", steps=4)
    assert applied["journey"]["steps"] == 4
    assert len(applied["journey"]["waypoints"]) == 4
    assert applied["text_intent"]


def test_prompt_journey_config_no_seed_required():
    applied = apply_preset("calm-focus", steps=3)
    assert applied["journey"]["mode"] == "prompt_journey"
    assert applied["music_params"]["bpm_range"][0] <= 85
