"""Style presets — DB-backed with built-in fallback."""

from __future__ import annotations

import uuid
from copy import deepcopy
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.schemas import StylePreset

STYLE_PRESETS: dict[str, dict[str, Any]] = {
    "lo-fi-night": {
        "id": "lo-fi-night",
        "label": "Lo-Fi 深夜",
        "category": "scene",
        "description": "温柔、怀旧、适合专注与放松",
        "example_intent": "深夜城市窗边的 lo-fi，从平静到略带希望",
        "moods": ["melancholic", "calm", "nostalgic"],
        "genres": ["lo-fi", "chillhop"],
        "bpm_range": [70, 90],
        "key": "A minor",
        "duration_preference": "medium",
        "default_curve": "calm_to_energy",
        "instrumental_default": True,
        "waypoint_template": [
            {"t": 0.0, "arousal": 2, "valence": 4, "description": "settle"},
            {"t": 0.5, "arousal": 4, "valence": 5, "description": "groove"},
            {"t": 1.0, "arousal": 3, "valence": 6, "description": "warmth"},
        ],
    },
    "calm-focus": {
        "id": "calm-focus",
        "label": "平静专注",
        "category": "scene",
        "description": "低能量、稳定情绪，适合工作学习",
        "example_intent": "保持专注的 ambient 纯音乐，几乎无波动",
        "moods": ["calm", "peaceful", "focused"],
        "genres": ["ambient", "electronic"],
        "bpm_range": [60, 85],
        "key": "C major",
        "duration_preference": "medium",
        "default_curve": "neutral",
        "instrumental_default": True,
        "waypoint_template": [
            {"t": 0.0, "arousal": 2, "valence": 5},
            {"t": 1.0, "arousal": 3, "valence": 5},
        ],
    },
    "energy-rise": {
        "id": "energy-rise",
        "label": "能量攀升",
        "category": "scene",
        "description": "从平静到高能量，适合运动与激励",
        "example_intent": "从安静铺垫逐渐进入高能量电子舞曲",
        "moods": ["energetic", "uplifting", "excited"],
        "genres": ["electronic", "house"],
        "bpm_range": [100, 130],
        "key": "G major",
        "duration_preference": "medium",
        "default_curve": "calm_to_energy",
        "instrumental_default": True,
        "waypoint_template": [
            {"t": 0.0, "arousal": 2, "valence": 4},
            {"t": 0.5, "arousal": 6, "valence": 6},
            {"t": 1.0, "arousal": 8, "valence": 7},
        ],
    },
    "cinematic": {
        "id": "cinematic",
        "label": "电影感",
        "category": "genre",
        "description": "宏大起伏、情绪张力",
        "example_intent": "电影预告片式的管弦电子混合，由暗到亮",
        "moods": ["dramatic", "epic", "emotional"],
        "genres": ["cinematic", "orchestral"],
        "bpm_range": [70, 110],
        "key": "D minor",
        "duration_preference": "long",
        "default_curve": "sad_to_hope",
        "instrumental_default": True,
        "waypoint_template": [
            {"t": 0.0, "arousal": 3, "valence": 3},
            {"t": 0.6, "arousal": 7, "valence": 5},
            {"t": 1.0, "arousal": 6, "valence": 7},
        ],
    },
    "pop-vocal": {
        "id": "pop-vocal",
        "label": "流行人声",
        "category": "genre",
        "description": "明亮流行，适合人声创作",
        "example_intent": "朗朗上口的流行副歌，温暖积极",
        "moods": ["happy", "bright", "romantic"],
        "genres": ["pop", "indie"],
        "bpm_range": [90, 115],
        "key": "C major",
        "duration_preference": "medium",
        "default_curve": "neutral",
        "instrumental_default": False,
        "waypoint_template": [
            {"t": 0.0, "arousal": 4, "valence": 6},
            {"t": 1.0, "arousal": 5, "valence": 7},
        ],
    },
    "alchemist-vip": {
        "id": "alchemist-vip",
        "label": "炼金师专属",
        "category": "scene",
        "description": "会员专属 · 深邃炼金氛围",
        "example_intent": "炼金工坊深处的神秘电子，金色光晕与低频脉动",
        "moods": ["mysterious", "focused", "ritual"],
        "genres": ["ambient", "electronic"],
        "bpm_range": [75, 95],
        "key": "E minor",
        "duration_preference": "medium",
        "default_curve": "neutral",
        "instrumental_default": True,
        "member_only": True,
        "waypoint_template": [
            {"t": 0.0, "arousal": 3, "valence": 4},
            {"t": 1.0, "arousal": 5, "valence": 6},
        ],
    },
}


def _row_to_dict(row: StylePreset) -> dict[str, Any]:
    return {
        "id": row.id,
        "label": row.label,
        "category": row.category,
        "description": row.description,
        "example_intent": row.example_intent,
        "moods": row.moods or [],
        "genres": row.genres or [],
        "bpm_range": row.bpm_range or [80, 120],
        "key": row.key or "auto",
        "duration_preference": row.duration_preference or "medium",
        "default_curve": row.default_curve or "neutral",
        "instrumental_default": bool(row.instrumental_default),
        "waypoint_template": row.waypoint_template or [],
        "tenant_id": row.tenant_id,
        "sort_order": row.sort_order or 0,
        "enabled": bool(row.enabled),
        "member_only": bool(getattr(row, "member_only", False)),
    }


def seed_builtin_presets(db: Session) -> int:
    """Insert built-in presets when table is empty."""
    if db.query(StylePreset).count() > 0:
        return 0
    for idx, preset in enumerate(STYLE_PRESETS.values()):
        db.add(
            StylePreset(
                id=preset["id"],
                label=preset["label"],
                category=preset.get("category", "scene"),
                description=preset.get("description"),
                example_intent=preset.get("example_intent"),
                moods=preset.get("moods", []),
                genres=preset.get("genres", []),
                bpm_range=preset.get("bpm_range", [80, 120]),
                key=preset.get("key", "auto"),
                duration_preference=preset.get("duration_preference", "medium"),
                default_curve=preset.get("default_curve", "neutral"),
                waypoint_template=preset.get("waypoint_template", []),
                instrumental_default=preset.get("instrumental_default", True),
                member_only=bool(preset.get("member_only", False)),
                sort_order=idx,
                enabled=True,
            )
        )
    db.commit()
    return len(STYLE_PRESETS)


def sync_member_presets(db: Session) -> int:
    """Upsert member-only built-in presets on existing deployments."""
    updated = 0
    member_presets = [p for p in STYLE_PRESETS.values() if p.get("member_only")]
    for i, preset in enumerate(member_presets):
        row = db.query(StylePreset).filter(StylePreset.id == preset["id"]).first()
        if row:
            if not row.member_only:
                row.member_only = True
                updated += 1
        else:
            db.add(
                StylePreset(
                    id=preset["id"],
                    label=preset["label"],
                    category=preset.get("category", "scene"),
                    description=preset.get("description"),
                    example_intent=preset.get("example_intent"),
                    moods=preset.get("moods", []),
                    genres=preset.get("genres", []),
                    bpm_range=preset.get("bpm_range", [80, 120]),
                    key=preset.get("key", "auto"),
                    duration_preference=preset.get("duration_preference", "medium"),
                    default_curve=preset.get("default_curve", "neutral"),
                    waypoint_template=preset.get("waypoint_template", []),
                    instrumental_default=preset.get("instrumental_default", True),
                    member_only=True,
                    sort_order=900 + i,
                    enabled=True,
                )
            )
            updated += 1
    if updated:
        db.commit()
    return updated


def list_presets(db: Session | None = None, category: str | None = None) -> list[dict[str, Any]]:
    if db is not None:
        q = db.query(StylePreset).filter(StylePreset.enabled == True)
        if category:
            q = q.filter(StylePreset.category == category)
        rows = q.order_by(StylePreset.sort_order.asc(), StylePreset.id.asc()).all()
        if rows:
            return [_row_to_dict(r) for r in rows]
    items = list(STYLE_PRESETS.values())
    if category:
        items = [p for p in items if p.get("category") == category]
    return sorted(items, key=lambda p: p["id"])


def get_preset(preset_id: str, db: Session | None = None) -> dict[str, Any] | None:
    if db is not None:
        row = db.query(StylePreset).filter(StylePreset.id == preset_id, StylePreset.enabled == True).first()
        if row:
            return _row_to_dict(row)
    return STYLE_PRESETS.get(preset_id)


def _scale_waypoints(template: list[dict], steps: int) -> list[dict]:
    if not template:
        return []
    n = max(steps, 1)
    result = []
    for i in range(n):
        t = i / max(n - 1, 1) if n > 1 else 0.0
        pos = t * (len(template) - 1)
        idx = min(int(pos), len(template) - 2) if len(template) > 1 else 0
        frac = pos - idx if len(template) > 1 else 0.0
        w0 = template[idx]
        w1 = template[min(idx + 1, len(template) - 1)]
        arousal = w0["arousal"] + (w1["arousal"] - w0["arousal"]) * frac
        valence = w0["valence"] + (w1["valence"] - w0["valence"]) * frac
        desc = w0.get("description") or w1.get("description")
        result.append(
            {
                "step": i,
                "arousal": round(arousal, 1),
                "valence": round(valence, 1),
                "description": desc,
            }
        )
    return result


def apply_preset(
    preset_id: str,
    steps: int = 6,
    overrides: dict[str, Any] | None = None,
    db: Session | None = None,
    *,
    user_id: uuid.UUID | None = None,
) -> dict[str, Any]:
    preset = get_preset(preset_id, db=db)
    if not preset:
        raise ValueError(f"Unknown preset: {preset_id}")

    if preset.get("member_only") and user_id and db is not None:
        from app.services.subscriptions import is_active_subscriber

        if not is_active_subscriber(db, user_id):
            raise HTTPException(status_code=403, detail="该风格预设仅限炼金师会员使用")

    steps = max(1, min(12, steps))
    overrides = overrides or {}

    journey = {
        "mode": "prompt_journey",
        "steps": steps,
        "target_curve": overrides.get("target_curve") or preset["default_curve"],
        "instrumental": overrides.get("instrumental", preset["instrumental_default"]),
        "title": overrides.get("title") or preset["label"],
        "waypoints": _scale_waypoints(preset.get("waypoint_template", []), steps),
    }

    music_params = {
        "bpm_range": list(overrides.get("bpm_range") or preset["bpm_range"]),
        "key": overrides.get("key") or preset["key"],
        "duration_preference": overrides.get("duration_preference") or preset["duration_preference"],
    }

    return {
        "preset_id": preset_id,
        "text_intent": overrides.get("text_intent") or preset.get("example_intent", ""),
        "moods": list(overrides.get("moods") or preset["moods"]),
        "genres": list(overrides.get("genres") or preset["genres"]),
        "journey": journey,
        "music_params": music_params,
        "preset": {k: preset[k] for k in ("id", "label", "category", "description", "example_intent") if k in preset},
    }
