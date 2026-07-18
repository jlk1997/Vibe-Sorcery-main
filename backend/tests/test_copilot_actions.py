"""Copilot StudioAction builder tests."""

from app.copilot.actions import build_studio_actions


def test_apply_preset_builds_prefill_and_navigate():
    actions = build_studio_actions(
        "apply_preset",
        {"preset_id": "lo-fi-night", "text_intent": "深夜专注", "steps": 6},
    )
    types = [a["type"] for a in actions]
    assert "prefill_create" in types
    assert "navigate" in types
    prefill = next(a for a in actions if a["type"] == "prefill_create")
    assert prefill["mode"] == "playlist"
    assert prefill["payload"]["preset_id"] == "lo-fi-night"


def test_start_generation_builds_confirm_action():
    actions = build_studio_actions(
        "start_generation",
        {
            "mode": "quickTrack",
            "text_intent": "深夜 lo-fi",
            "estimate": {"cost": 3, "label": "single"},
        },
    )
    types = [a["type"] for a in actions]
    assert "start_generation" in types
    assert "prefill_create" in types
    assert "navigate" in types


def test_plan_journey_builds_journey_prefill():
    actions = build_studio_actions(
        "plan_journey_hint",
        {"journey": {"mode": "prompt_journey", "waypoints": []}, "text_intent": "焦虑到平静"},
    )
    assert any(a["type"] == "prefill_journey" for a in actions)
