"""Arrangement structure templates for journey waypoints."""

from __future__ import annotations

from copy import deepcopy

STRUCTURE_TEMPLATES: dict[str, dict] = {
    "classic_arc": {
        "id": "classic_arc",
        "label": "经典起承转合",
        "segments": [
            {"name": "intro", "t": 0.0, "arousal": 2, "valence": 4},
            {"name": "verse", "t": 0.2, "arousal": 3, "valence": 5},
            {"name": "build", "t": 0.45, "arousal": 5, "valence": 6},
            {"name": "peak", "t": 0.7, "arousal": 7, "valence": 7},
            {"name": "outro", "t": 1.0, "arousal": 3, "valence": 6},
        ],
    },
    "dj_set": {
        "id": "dj_set",
        "label": "DJ 套装",
        "segments": [
            {"name": "warmup", "t": 0.0, "arousal": 3, "valence": 5},
            {"name": "build1", "t": 0.25, "arousal": 5, "valence": 6},
            {"name": "build2", "t": 0.5, "arousal": 7, "valence": 7},
            {"name": "peak", "t": 0.75, "arousal": 8, "valence": 8},
            {"name": "cooldown", "t": 1.0, "arousal": 4, "valence": 6},
        ],
    },
    "meditation": {
        "id": "meditation",
        "label": "冥想放松",
        "segments": [
            {"name": "settle", "t": 0.0, "arousal": 2, "valence": 5},
            {"name": "deepen", "t": 0.33, "arousal": 2, "valence": 4},
            {"name": "hold", "t": 0.66, "arousal": 2, "valence": 5},
            {"name": "release", "t": 1.0, "arousal": 3, "valence": 6},
        ],
    },
}


def apply_structure_template(template_id: str, steps: int) -> list[dict]:
    tmpl = STRUCTURE_TEMPLATES.get(template_id)
    if not tmpl:
        raise ValueError(f"Unknown structure template: {template_id}")

    segments = deepcopy(tmpl["segments"])
    waypoints = []
    for i in range(steps):
        t = i / max(steps - 1, 1)
        seg = segments[0]
        for s in segments:
            if s["t"] <= t:
                seg = s
        waypoints.append({
            "step": i,
            "arousal": seg["arousal"],
            "valence": seg["valence"],
            "description": seg["name"],
            "t": t,
        })
    return waypoints


def list_structure_templates() -> list[dict]:
    return [{"id": t["id"], "label": t["label"]} for t in STRUCTURE_TEMPLATES.values()]
