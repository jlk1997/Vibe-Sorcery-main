from app.core.sound_recipe_options import normalize_option_id
from app.core.music_intent_parser import parse_music_intent_keywords
from app.core.music_prompt_builder import (
    MusicCreativeSpec,
    apply_built_prompt_hint,
    build_minimax_prompt,
    merge_creative_spec,
    spec_from_legacy_config,
)


def test_build_minimax_prompt_violin_classical_slow():
    spec = MusicCreativeSpec(
        instruments=["violin"],
        genres=["classical"],
        tempo_feel="slow",
        text_intent="背景古典氛围",
    )
    prompt = build_minimax_prompt(spec)
    assert "violin" in prompt.lower()
    assert "classical" in prompt.lower()
    assert "slow tempo" in prompt.lower()
    assert "背景古典氛围" in prompt


def test_build_minimax_prompt_style_tags_first_after_instruments():
    spec = MusicCreativeSpec(
        instruments=["saxophone"],
        style_tags="Jazz, Lounge",
        genres=["classical"],
    )
    prompt = build_minimax_prompt(spec)
    assert prompt.index("saxophone") < prompt.index("Jazz")
    assert "classical" in prompt.lower()


def test_text_intent_not_dropped_with_journey_hint():
    spec = apply_built_prompt_hint(
        MusicCreativeSpec(instruments=["piano"], text_intent="雨夜独奏"),
        "gradual energy rise toward hopeful chorus",
    )
    prompt = build_minimax_prompt(spec)
    assert "piano" in prompt.lower()
    assert "雨夜独奏" in prompt
    assert "gradual energy" in prompt.lower()


def test_merge_manual_overrides_parsed():
    manual = MusicCreativeSpec(instruments=["violin"], genres=["classical"])
    parsed = MusicCreativeSpec(instruments=["guitar"], genres=["rock"], moods=["happy"])
    merged = merge_creative_spec(manual=manual, parsed=parsed)
    assert merged.instruments == ["violin"]
    assert merged.genres == ["classical"]
    assert merged.moods == ["happy"]


def test_spec_from_legacy_config():
    cfg = {
        "text_intent": "萨克斯爵士",
        "moods": ["calm"],
        "genres": ["jazz"],
        "bpm": 90,
        "key": "A minor",
        "style_tags": "Smooth Jazz",
    }
    spec = spec_from_legacy_config(cfg)
    assert spec.text_intent == "萨克斯爵士"
    assert spec.genres == ["jazz"]
    assert spec.bpm == 90
    assert spec.style_tags == "Smooth Jazz"


def test_keyword_parser_sax_classical():
    spec = parse_music_intent_keywords("萨克斯 古典背景 慢节奏")
    assert "saxophone" in spec.instruments
    assert "classical" in spec.genres
    assert spec.tempo_feel == "slow"


def test_build_minimax_prompt_resolves_lofi_token():
    spec = MusicCreativeSpec(genres=["lofi"], moods=["calm"])
    prompt = build_minimax_prompt(spec)
    assert "lo-fi" in prompt


def test_custom_prompt_override_wins():
    spec = MusicCreativeSpec(
        instruments=["violin"],
        custom_prompt_override="Custom orchestral piece, 72 BPM, D minor",
    )
    assert build_minimax_prompt(spec) == "Custom orchestral piece, 72 BPM, D minor"


def test_normalize_option_id_maps_preset_genre():
    assert normalize_option_id("lo-fi", "genres") == "lofi"
    assert normalize_option_id("hip-hop", "genres") == "hiphop"
