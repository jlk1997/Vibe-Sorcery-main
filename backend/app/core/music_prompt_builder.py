"""Build MiniMax music_generation prompt from structured creative spec."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from app.core.sound_recipe_options import resolve_prompt_token

TempoFeel = Literal["slow", "medium", "fast", ""]

TEMPO_FEEL_BPM: dict[str, tuple[int, int]] = {
    "slow": (60, 80),
    "medium": (80, 110),
    "fast": (110, 140),
}

TEMPO_FEEL_LABEL: dict[str, str] = {
    "slow": "slow tempo",
    "medium": "moderate tempo",
    "fast": "upbeat tempo",
}


class MusicCreativeSpec(BaseModel):
    instruments: list[str] = Field(default_factory=list)
    genres: list[str] = Field(default_factory=list)
    moods: list[str] = Field(default_factory=list)
    tempo_feel: TempoFeel = ""
    bpm: int | None = Field(default=None, ge=40, le=220)
    bpm_range: list[int] | None = None
    key: str = "auto"
    texture: str = ""
    meter: str = ""
    era: str = ""
    text_intent: str = ""
    style_tags: str = ""
    journey_hint: str = ""
    custom_prompt_override: str = ""
    # 情绪坐标（1-9）：arousal=能量，valence=明暗。来自情绪诊断/情绪盘，
    # 通过 av_to_prompt_tokens() 转成能量词/明暗词/tempo 注入提示词。
    arousal: float | None = Field(default=None, ge=1, le=9)
    valence: float | None = Field(default=None, ge=1, le=9)

    def has_user_constraints(self) -> bool:
        return bool(
            self.instruments
            or self.genres
            or self.moods
            or self.style_tags.strip()
            or self.text_intent.strip()
            or self.tempo_feel
            or self.bpm
            or self.bpm_range
            or (self.key and self.key.lower() != "auto")
            or self.texture
            or self.meter
            or self.era
            or self.custom_prompt_override.strip()
            or self.arousal is not None
            or self.valence is not None
        )


def tempo_feel_to_bpm_range(tempo_feel: str | None) -> tuple[int, int] | None:
    if not tempo_feel:
        return None
    return TEMPO_FEEL_BPM.get(tempo_feel)


def av_to_prompt_tokens(
    arousal: float | None, valence: float | None
) -> tuple[list[str], tuple[int, int] | None]:
    """确定性地把情绪坐标(1-9)映射成能量/明暗描述词与推导 BPM 区间。

    - arousal 决定能量与 tempo：低→舒缓少音、中→稳定律动、高→高能推进。
    - valence 决定明暗氛围：低→阴郁、中→内省、高→明亮温暖。
    仅做本地规则映射，不调用任何大模型。
    """
    tokens: list[str] = []
    bpm_range: tuple[int, int] | None = None

    if arousal is not None:
        a = max(1.0, min(9.0, float(arousal)))
        if a <= 3:
            tokens.append("calm, gentle, sparse arrangement, soft dynamics")
            bpm_range = (60, 80)
        elif a <= 6:
            tokens.append("moderate energy, steady groove")
            bpm_range = (85, 110)
        else:
            tokens.append("high energy, driving rhythm, intense")
            bpm_range = (115, 140)

    if valence is not None:
        v = max(1.0, min(9.0, float(valence)))
        if v <= 3:
            tokens.append("dark, melancholic, somber mood")
        elif v <= 6:
            tokens.append("contemplative, introspective mood")
        else:
            tokens.append("bright, uplifting, warm mood")

    return tokens, bpm_range


def _dedupe_join(parts: list[str], limit: int = 12) -> str:
    seen: set[str] = set()
    out: list[str] = []
    for raw in parts:
        token = (raw or "").strip()
        if not token:
            continue
        key = token.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(token)
        if len(out) >= limit:
            break
    return ", ".join(out)


def _instrument_phrase(instruments: list[str]) -> str:
    tokens = [resolve_prompt_token(t) for t in instruments if t and t.strip()]
    tokens = [t for t in tokens if t]
    if not tokens:
        return ""
    if len(tokens) == 1:
        return f"featuring {tokens[0]}"
    return f"featuring {', '.join(tokens)}"


def _resolve_list(values: list[str]) -> list[str]:
    return [resolve_prompt_token(v) for v in values if v and v.strip()]


def build_minimax_prompt(spec: MusicCreativeSpec) -> str:
    """Compose official comma-separated MiniMax music prompt (max 2000 chars)."""
    override = (spec.custom_prompt_override or "").strip()
    if override:
        return override[:2000]

    parts: list[str] = []

    inst = _instrument_phrase(spec.instruments)
    if inst:
        parts.append(inst)

    style_tags = (spec.style_tags or "").strip()
    if style_tags:
        parts.append(style_tags)

    parts.extend(_resolve_list(spec.genres))
    parts.extend(_resolve_list(spec.moods))

    av_tokens, av_bpm_range = av_to_prompt_tokens(spec.arousal, spec.valence)
    parts.extend(av_tokens)

    era = resolve_prompt_token(spec.era)
    if era:
        parts.append(era)

    texture = resolve_prompt_token(spec.texture)
    if texture:
        parts.append(texture)

    meter = resolve_prompt_token(spec.meter)
    if meter:
        parts.append(meter)

    if spec.tempo_feel and spec.tempo_feel in TEMPO_FEEL_LABEL:
        parts.append(TEMPO_FEEL_LABEL[spec.tempo_feel])

    if spec.bpm:
        parts.append(f"{spec.bpm} BPM")
    elif spec.bpm_range and len(spec.bpm_range) >= 2:
        lo, hi = int(spec.bpm_range[0]), int(spec.bpm_range[1])
        parts.append(f"{lo}-{hi} BPM")
    elif spec.tempo_feel:
        rng = tempo_feel_to_bpm_range(spec.tempo_feel)
        if rng:
            parts.append(f"{rng[0]}-{rng[1]} BPM")
    elif av_bpm_range:
        parts.append(f"{av_bpm_range[0]}-{av_bpm_range[1]} BPM")

    key = (spec.key or "").strip()
    if key and key.lower() not in ("auto", ""):
        parts.append(key)

    journey = (spec.journey_hint or "").strip()
    if journey:
        parts.append(journey)

    text = (spec.text_intent or "").strip()
    if text:
        parts.append(text)

    prompt = _dedupe_join(parts)
    return prompt[:2000]


_MOOD_AV_MAP: dict[str, tuple[float, float]] = {
    # mood_id: (arousal, valence)  1-9 量表
    "calm": (3.0, 6.0),
    "peaceful": (2.5, 6.5),
    "ambient": (2.5, 5.5),
    "melancholic": (3.5, 2.5),
    "melancholy": (3.5, 2.5),
    "sad": (3.0, 2.0),
    "dark": (5.0, 2.5),
    "tense": (7.0, 3.0),
    "dramatic": (7.5, 4.0),
    "energetic": (8.0, 7.0),
    "happy": (6.5, 8.0),
    "uplifting": (7.0, 8.0),
    "romantic": (4.5, 7.0),
    "dreamy": (3.5, 6.5),
    "epic": (8.0, 6.5),
    "hopeful": (5.5, 7.5),
}


def estimate_av_from_moods(moods: list[str] | None) -> tuple[float | None, float | None]:
    """无显式 A/V 时，用 moods 粗略推导情绪坐标，用于点亮下游情绪生态。"""
    if not moods:
        return None, None
    hits = [_MOOD_AV_MAP[m.strip().lower()] for m in moods if m and m.strip().lower() in _MOOD_AV_MAP]
    if not hits:
        return None, None
    avg_a = sum(h[0] for h in hits) / len(hits)
    avg_v = sum(h[1] for h in hits) / len(hits)
    return round(avg_a, 1), round(avg_v, 1)


def spec_from_legacy_config(config: dict[str, Any]) -> MusicCreativeSpec:
    """Build spec from job config / API payload (backward compatible)."""
    raw = config.get("creative_spec")
    if isinstance(raw, dict):
        base = MusicCreativeSpec.model_validate(raw)
    else:
        base = MusicCreativeSpec()

    moods = list(config.get("moods") or base.moods)
    genres = list(config.get("genres") or base.genres)
    bpm = config.get("bpm") or base.bpm
    key = config.get("key") or base.key or "auto"
    text_intent = (config.get("text_intent") or base.text_intent or "").strip()
    style_tags = (config.get("style_tags") or base.style_tags or "").strip()

    tempo_feel = base.tempo_feel
    bpm_range = base.bpm_range
    if not bpm and not bpm_range and config.get("music_params"):
        mp = config["music_params"]
        if isinstance(mp, dict) and mp.get("bpm_range"):
            bpm_range = list(mp["bpm_range"])

    return MusicCreativeSpec(
        instruments=list(base.instruments),
        genres=genres or list(base.genres),
        moods=moods or list(base.moods),
        tempo_feel=tempo_feel or base.tempo_feel,
        bpm=bpm,
        bpm_range=bpm_range,
        key=key,
        texture=base.texture,
        meter=base.meter,
        era=base.era,
        text_intent=text_intent or base.text_intent,
        style_tags=style_tags or base.style_tags,
        journey_hint=base.journey_hint,
        custom_prompt_override=base.custom_prompt_override,
        arousal=base.arousal,
        valence=base.valence,
    )


def merge_creative_spec(
    *,
    manual: MusicCreativeSpec | None = None,
    parsed: MusicCreativeSpec | None = None,
    preset: dict[str, Any] | None = None,
    style_tags: str | None = None,
) -> MusicCreativeSpec:
    """Manual chip selections win; parsed intent fills gaps; preset supplies defaults."""
    out = MusicCreativeSpec()
    if preset:
        out.genres = [normalize_option_id(g, "genres") for g in (preset.get("genres") or [])]
        out.moods = [normalize_option_id(m, "moods") for m in (preset.get("moods") or [])]
        out.genres = [g for g in out.genres if g]
        out.moods = [m for m in out.moods if m]
        if preset.get("bpm_range"):
            out.bpm_range = list(preset["bpm_range"])
        if preset.get("key"):
            out.key = str(preset["key"])
    if parsed:
        if not out.instruments:
            out.instruments = list(parsed.instruments)
        if not out.genres:
            out.genres = list(parsed.genres)
        if not out.moods:
            out.moods = list(parsed.moods)
        if not out.tempo_feel:
            out.tempo_feel = parsed.tempo_feel
        if out.bpm is None:
            out.bpm = parsed.bpm
        if not out.bpm_range:
            out.bpm_range = parsed.bpm_range
        if not out.key or out.key == "auto":
            out.key = parsed.key or "auto"
        if not out.texture:
            out.texture = parsed.texture
        if not out.meter:
            out.meter = parsed.meter
        if not out.era:
            out.era = parsed.era
        if not out.text_intent:
            out.text_intent = parsed.text_intent
    if manual:
        if manual.instruments:
            out.instruments = list(manual.instruments)
        if manual.genres:
            out.genres = list(manual.genres)
        if manual.moods:
            out.moods = list(manual.moods)
        if manual.tempo_feel:
            out.tempo_feel = manual.tempo_feel
        if manual.bpm is not None:
            out.bpm = manual.bpm
        if manual.bpm_range:
            out.bpm_range = list(manual.bpm_range)
        if manual.key and manual.key != "auto":
            out.key = manual.key
        if manual.texture:
            out.texture = manual.texture
        if manual.meter:
            out.meter = manual.meter
        if manual.era:
            out.era = manual.era
        if manual.text_intent:
            out.text_intent = manual.text_intent
        if manual.style_tags:
            out.style_tags = manual.style_tags
        if manual.journey_hint:
            out.journey_hint = manual.journey_hint
        if manual.custom_prompt_override:
            out.custom_prompt_override = manual.custom_prompt_override
        if manual.arousal is not None:
            out.arousal = manual.arousal
        if manual.valence is not None:
            out.valence = manual.valence
    if parsed:
        if out.arousal is None and parsed.arousal is not None:
            out.arousal = parsed.arousal
        if out.valence is None and parsed.valence is not None:
            out.valence = parsed.valence
    if style_tags and style_tags.strip():
        out.style_tags = style_tags.strip()
    return out


def apply_built_prompt_hint(spec: MusicCreativeSpec, built_prompt: str | None) -> MusicCreativeSpec:
    """Attach M3 journey hint without replacing user instruments/genres."""
    hint = (built_prompt or "").strip()
    if not hint:
        return spec
    merged = spec.model_copy(deep=True)
    merged.journey_hint = hint
    return merged
