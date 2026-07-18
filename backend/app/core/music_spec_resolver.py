"""Resolve final MusicCreativeSpec for generation jobs."""

from __future__ import annotations

from typing import Any

from app.core.music_intent_parser import merge_keyword_gaps, parse_music_intent, parse_music_intent_keywords
from app.core.music_prompt_builder import MusicCreativeSpec, merge_creative_spec, spec_from_legacy_config
from app.core.style_presets import get_preset


async def resolve_creative_spec(
    config: dict[str, Any],
    *,
    preset: dict[str, Any] | None = None,
    parse_if_sparse: bool = True,
) -> MusicCreativeSpec:
    """Merge manual spec, legacy fields, preset, and optional NLP parse."""
    manual = spec_from_legacy_config(config)
    text = (config.get("text_intent") or manual.text_intent or "").strip()

    parsed: MusicCreativeSpec | None = None
    if text and not manual.instruments and not manual.genres:
        parsed = parse_music_intent_keywords(text)
        if parse_if_sparse and not parsed.has_user_constraints() and len(text) >= 20:
            parsed = await parse_music_intent(text)
    elif text and not manual.instruments:
        parsed = parse_music_intent_keywords(text)

    if preset is None and config.get("preset_id"):
        try:
            preset = get_preset(str(config["preset_id"]))
        except Exception:
            preset = None

    merged = merge_creative_spec(
        manual=manual,
        parsed=parsed,
        preset=preset,
        style_tags=config.get("style_tags"),
    )

    if text and not merged.text_intent:
        merged = merged.model_copy(update={"text_intent": text})

    if parsed and not manual.instruments and not manual.genres:
        merged = merge_keyword_gaps(merged, parsed)

    return merged


def infer_moods_genres_from_spec(spec: MusicCreativeSpec, fallback_moods: list[str], fallback_genres: list[str]) -> tuple[list[str], list[str]]:
    moods = list(spec.moods) if spec.moods else list(fallback_moods)
    genres = list(spec.genres) if spec.genres else list(fallback_genres)
    if spec.has_user_constraints():
        if not moods and spec.text_intent:
            kw = parse_music_intent_keywords(spec.text_intent)
            moods = kw.moods or moods
        if not genres and spec.text_intent:
            kw = parse_music_intent_keywords(spec.text_intent)
            genres = kw.genres or genres
    return moods[:5], genres[:5]
