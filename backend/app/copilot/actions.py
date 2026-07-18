"""Build StudioAction list from Copilot tool results."""

from __future__ import annotations

from typing import Any


def build_studio_actions(tool_name: str, tool_result: dict[str, Any]) -> list[dict[str, Any]]:
    actions: list[dict[str, Any]] = []

    if tool_name == "apply_preset" and tool_result.get("preset_id"):
        actions.append(
            {
                "type": "prefill_create",
                "mode": "playlist",
                "payload": {
                    "text_intent": tool_result.get("text_intent", ""),
                    "preset_id": tool_result["preset_id"],
                    "steps": tool_result.get("steps", 6),
                },
            }
        )
        actions.append({"type": "navigate", "path": "/pages/create/index", "params": {"mode": "playlist"}})

    elif tool_name == "plan_journey_hint" and tool_result.get("journey"):
        journey = tool_result["journey"]
        actions.append(
            {
                "type": "prefill_journey",
                "payload": {
                    "text_intent": tool_result.get("text_intent", ""),
                    "journey": journey,
                    "title": tool_result.get("title", journey.get("title", "情绪旅程")),
                },
            }
        )
        actions.append({"type": "navigate", "path": "/packageStudio/pages/journey/index"})

    elif tool_name == "suggest_mode" and tool_result.get("mode"):
        mode_map = {
            "quickTrack": "quickTrack",
            "playlist": "playlist",
            "textJourney": "playlist",
            "remix": "remix",
            "cover": "cover",
            "variation": "variation",
        }
        create_mode = mode_map.get(str(tool_result["mode"]), "quickTrack")
        actions.append(
            {
                "type": "prefill_create",
                "mode": create_mode,
                "payload": {"text_intent": tool_result.get("user_text", "")},
            }
        )
        actions.append({"type": "navigate", "path": "/pages/create/index", "params": {"mode": create_mode}})

    elif tool_name == "explain_credits":
        actions.append({"type": "navigate", "path": "/pages/pricing/index"})
        if tool_result.get("pricing"):
            actions.append({"type": "show_paywall", "required": 0, "balance": None})

    elif tool_name == "start_generation" and tool_result.get("estimate"):
        est = tool_result["estimate"]
        mode = tool_result.get("mode", "quickTrack")
        actions.append(
            {
                "type": "prefill_create",
                "mode": mode,
                "payload": {
                    "text_intent": tool_result.get("text_intent", ""),
                    "preset_id": tool_result.get("preset_id"),
                },
            }
        )
        actions.append(
            {
                "type": "start_generation",
                "mode": mode,
                "estimate": est,
                "requires_confirm": True,
            }
        )
        actions.append({"type": "navigate", "path": "/pages/create/index", "params": {"mode": mode}})

    navigate = tool_result.get("navigate")
    if navigate and not any(a.get("type") == "navigate" for a in actions):
        actions.append({"type": "navigate", "path": str(navigate)})

    return actions
