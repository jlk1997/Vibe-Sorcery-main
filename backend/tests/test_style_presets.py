"""Style preset helpers."""

from app.core.style_presets import apply_preset, get_preset, list_presets, STYLE_PRESETS


def test_builtin_preset_fallback():
    preset = get_preset("lo-fi-night", db=None)
    assert preset is not None
    assert preset["id"] == "lo-fi-night"


def test_apply_preset_builtin():
    applied = apply_preset("energy-rise", steps=4, db=None)
    assert applied["preset_id"] == "energy-rise"
    assert len(applied["journey"]["waypoints"]) == 4


def test_list_presets_builtin():
    items = list_presets(db=None)
    assert len(items) >= len(STYLE_PRESETS)
