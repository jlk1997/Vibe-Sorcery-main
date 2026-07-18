"""Parse natural-language music intent into MusicCreativeSpec (M3 + keyword fallback)."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from app.config import settings
from app.core.music_prompt_builder import MusicCreativeSpec, tempo_feel_to_bpm_range

logger = logging.getLogger(__name__)

# zh keyword -> (instrument prompt token, genre hint)
INSTRUMENT_KEYWORDS: dict[str, str] = {
    "小提琴": "violin",
    "violin": "violin",
    "萨克斯": "saxophone",
    "saxophone": "saxophone",
    "sax": "saxophone",
    "钢琴": "piano",
    "piano": "piano",
    "吉他": "acoustic guitar",
    "guitar": "acoustic guitar",
    "大提琴": "cello",
    "cello": "cello",
    "长笛": "flute",
    "flute": "flute",
    "小号": "trumpet",
    "trumpet": "trumpet",
    "鼓": "drums",
    "drums": "drums",
    "弦乐": "strings section",
    "strings": "strings section",
    "管弦": "orchestral",
    "orchestra": "orchestral",
    "合成器": "synthesizer",
    "synth": "synthesizer",
    "二胡": "erhu",
    "古筝": "guzheng",
    "琵琶": "pipa",
}

GENRE_KEYWORDS: dict[str, str] = {
    "古典": "classical",
    "classical": "classical",
    "爵士": "jazz",
    "jazz": "jazz",
    "流行": "pop",
    "pop": "pop",
    "电子": "electronic",
    "electronic": "electronic",
    "民谣": "folk",
    "folk": "folk",
    "摇滚": "rock",
    "rock": "rock",
    "嘻哈": "hip-hop",
    "hip-hop": "hip-hop",
    "hiphop": "hip-hop",
    "氛围": "ambient",
    "ambient": "ambient",
    "lo-fi": "lo-fi",
    "lofi": "lo-fi",
    "电影": "cinematic",
    "cinematic": "cinematic",
    "蓝调": "blues",
    "blues": "blues",
    "乡村": "country",
    "country": "country",
    "金属": "metal",
    "metal": "metal",
    "放克": "funk",
    "funk": "funk",
}

MOOD_KEYWORDS: dict[str, str] = {
    "悲伤": "melancholic",
    "忧郁": "melancholic",
    "sad": "melancholic",
    "快乐": "happy",
    "欢快": "uplifting",
    "happy": "happy",
    "平静": "calm",
    "calm": "calm",
    "激情": "passionate",
    "浪漫": "romantic",
    "romantic": "romantic",
    "黑暗": "dark",
    "dark": "dark",
    "希望": "hopeful",
    "hopeful": "hopeful",
}

ERA_KEYWORDS: dict[str, str] = {
    "巴洛克": "Baroque era",
    "baroque": "Baroque era",
    "浪漫": "Romantic era",
    "romantic era": "Romantic era",
    "现代": "modern",
    "modern": "modern",
    "中世纪": "medieval",
    "medieval": "medieval",
}

TEXTURE_KEYWORDS: dict[str, str] = {
    "独奏": "solo performance",
    "solo": "solo performance",
    "室内乐": "chamber ensemble",
    "chamber": "chamber ensemble",
    "管弦乐": "full orchestral",
    "orchestral": "full orchestral",
    "乐队": "band arrangement",
    "band": "band arrangement",
}

METER_KEYWORDS: dict[str, str] = {
    "华尔兹": "waltz 3/4 time",
    "waltz": "waltz 3/4 time",
    "3/4": "waltz 3/4 time",
    "4/4": "steady 4/4 time",
    "摇摆": "swing rhythm",
    "swing": "swing rhythm",
}


def _keyword_scan(text: str, table: dict[str, str]) -> list[str]:
    lower = text.lower()
    found: list[str] = []
    for key, token in table.items():
        if key in lower or key in text:
            if token not in found:
                found.append(token)
    return found


def _detect_tempo_feel(text: str) -> str:
    lower = text.lower()
    if any(k in lower or k in text for k in ("慢", "缓慢", "慢板", "slow", "largo", "adagio")):
        return "slow"
    if any(k in lower or k in text for k in ("快", "快速", "快板", "fast", "upbeat", "allegro")):
        return "fast"
    if any(k in lower or k in text for k in ("中速", "中等", "moderate", "medium")):
        return "medium"
    return ""


def _detect_bpm(text: str) -> int | None:
    m = re.search(r"(\d{2,3})\s*bpm", text, re.I)
    if m:
        val = int(m.group(1))
        if 40 <= val <= 220:
            return val
    return None


def parse_music_intent_keywords(text: str) -> MusicCreativeSpec:
    """Rule-based parser for mock mode and M3 fallback."""
    t = (text or "").strip()
    if not t:
        return MusicCreativeSpec()

    tempo_feel = _detect_tempo_feel(t)
    bpm = _detect_bpm(t)
    bpm_range = None
    if not bpm and tempo_feel:
        rng = tempo_feel_to_bpm_range(tempo_feel)
        if rng:
            bpm_range = [rng[0], rng[1]]

    return MusicCreativeSpec(
        instruments=_keyword_scan(t, INSTRUMENT_KEYWORDS),
        genres=_keyword_scan(t, GENRE_KEYWORDS),
        moods=_keyword_scan(t, MOOD_KEYWORDS),
        tempo_feel=tempo_feel,
        bpm=bpm,
        bpm_range=bpm_range,
        era=", ".join(_keyword_scan(t, ERA_KEYWORDS)[:1]),
        texture=", ".join(_keyword_scan(t, TEXTURE_KEYWORDS)[:1]),
        meter=", ".join(_keyword_scan(t, METER_KEYWORDS)[:1]),
        text_intent=t,
    )


def _normalize_parsed(data: dict[str, Any], fallback_text: str) -> MusicCreativeSpec:
    def _list(val: Any) -> list[str]:
        if isinstance(val, list):
            return [str(x).strip() for x in val if str(x).strip()]
        if isinstance(val, str) and val.strip():
            return [val.strip()]
        return []

    tempo_feel = str(data.get("tempo_feel") or "").strip().lower()
    if tempo_feel not in ("slow", "medium", "fast"):
        tempo_feel = _detect_tempo_feel(fallback_text)

    bpm = data.get("bpm")
    if bpm is not None:
        try:
            bpm = int(bpm)
        except (TypeError, ValueError):
            bpm = None

    bpm_range = data.get("bpm_range")
    if isinstance(bpm_range, list) and len(bpm_range) >= 2:
        bpm_range = [int(bpm_range[0]), int(bpm_range[1])]
    else:
        bpm_range = None

    spec = MusicCreativeSpec(
        instruments=_list(data.get("instruments")),
        genres=_list(data.get("genres")),
        moods=_list(data.get("moods")),
        tempo_feel=tempo_feel,
        bpm=bpm,
        bpm_range=bpm_range,
        key=str(data.get("key") or "auto"),
        texture=str(data.get("texture") or "").strip(),
        meter=str(data.get("meter") or "").strip(),
        era=str(data.get("era") or "").strip(),
        text_intent=(fallback_text or str(data.get("text_intent") or "")).strip(),
    )
    if not spec.instruments and not spec.genres:
        kw = parse_music_intent_keywords(fallback_text)
        return merge_keyword_gaps(spec, kw)
    return spec


def merge_keyword_gaps(base: MusicCreativeSpec, kw: MusicCreativeSpec) -> MusicCreativeSpec:
    merged = base.model_copy(deep=True)
    if not merged.instruments:
        merged.instruments = list(kw.instruments)
    if not merged.genres:
        merged.genres = list(kw.genres)
    if not merged.moods:
        merged.moods = list(kw.moods)
    if not merged.tempo_feel:
        merged.tempo_feel = kw.tempo_feel
    if merged.bpm is None:
        merged.bpm = kw.bpm
    if not merged.bpm_range:
        merged.bpm_range = kw.bpm_range
    if not merged.era:
        merged.era = kw.era
    if not merged.texture:
        merged.texture = kw.texture
    if not merged.meter:
        merged.meter = kw.meter
    if not merged.text_intent:
        merged.text_intent = kw.text_intent
    return merged


async def parse_music_intent(
    text: str,
    *,
    language: str = "zh",
    minimax_client: Any | None = None,
) -> MusicCreativeSpec:
    """Parse user description into structured spec (M3 JSON, keyword fallback)."""
    t = (text or "").strip()
    if not t:
        return MusicCreativeSpec()

    if settings.use_mock_ai:
        return parse_music_intent_keywords(t)

    if minimax_client is None:
        from app.integrations.minimax.client import minimax_client as default_client

        minimax_client = default_client

    system = (
        "You extract music creation constraints from user text for MiniMax music-2.6. "
        "Return ONLY valid JSON with keys: "
        "instruments (array of English instrument names), genres (array), moods (array), "
        "tempo_feel (slow|medium|fast|empty string), bpm (int or null), bpm_range ([lo,hi] or null), "
        "key (string like 'A minor' or 'auto'), texture, meter, era, text_intent (preserve original user phrases). "
        "NEVER drop instruments or genres the user explicitly named. "
        "Map 小提琴→violin, 萨克斯→saxophone, 古典→classical, 爵士→jazz."
    )
    user_msg = json.dumps({"text": t, "language": language}, ensure_ascii=False)
    try:
        raw = await minimax_client.chat_completion(
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_msg},
            ],
            response_format="json",
        )
        data = json.loads(raw)
        if isinstance(data, dict):
            return _normalize_parsed(data, t)
    except Exception as exc:
        logger.warning("parse_music_intent M3 failed, using keywords: %s", exc)

    return parse_music_intent_keywords(t)
