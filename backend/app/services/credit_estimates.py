"""Credit cost estimation for pre-flight UI."""

from __future__ import annotations

from app.services.credits import (
    COVER_COST,
    GENERATION_COST,
    LYRICS_COST,
    PLAYLIST_COST,
    REMIX_COST,
)

_MODE_COSTS: dict[str, int] = {
    "single": GENERATION_COST,
    "quickTrack": GENERATION_COST,
    "playlist": PLAYLIST_COST,
    "remix": REMIX_COST,
    "cover": COVER_COST,
    "lyrics": LYRICS_COST,
    "variation": GENERATION_COST,
}


def estimate_credits(
    *,
    mode: str = "single",
    count: int = 1,
    variations: int | None = None,
) -> dict:
    base = _MODE_COSTS.get(mode, GENERATION_COST)
    if mode == "variation" and variations is not None:
        n = max(2, min(5, variations))
        total = n * GENERATION_COST
        return {
            "credits": total,
            "mode": mode,
            "breakdown": [{"label": "variation", "unit_cost": GENERATION_COST, "quantity": n, "subtotal": total}],
        }
    if mode == "playlist":
        total = PLAYLIST_COST
        return {
            "credits": total,
            "mode": mode,
            "breakdown": [{"label": "playlist", "unit_cost": PLAYLIST_COST, "quantity": 1, "subtotal": total}],
        }
    qty = max(1, count)
    total = base * qty
    return {
        "credits": total,
        "mode": mode,
        "breakdown": [{"label": mode, "unit_cost": base, "quantity": qty, "subtotal": total}],
    }
