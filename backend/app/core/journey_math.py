"""AV waypoint interpolation and music duration helpers."""

from app.integrations.minimax.client import JOURNEY_CURVES

DURATION_BY_PREFERENCE = {
    "short": 60.0,
    "medium": 120.0,
    "long": 180.0,
}


def duration_from_preference(preference: str | None) -> float:
    return DURATION_BY_PREFERENCE.get(preference or "medium", 120.0)


def target_av_for_step(
    step: int,
    total_steps: int,
    waypoints: list[dict] | None,
    target_curve: str,
) -> tuple[float, float]:
    """Resolve target (arousal, valence) for a generation step."""
    if waypoints:
        av = _interpolate_waypoints(waypoints, step, total_steps)
        if av:
            return av

    curve = JOURNEY_CURVES.get(target_curve, JOURNEY_CURVES["calm_to_energy"])
    t = step / max(total_steps, 1)
    arousal = curve["start"][0] + (curve["end"][0] - curve["start"][0]) * t
    valence = curve["start"][1] + (curve["end"][1] - curve["start"][1]) * t
    return float(arousal), float(valence)


def _interpolate_waypoints(
    waypoints: list[dict],
    step: int,
    total_steps: int,
) -> tuple[float, float] | None:
    if not waypoints:
        return None

    sorted_wps = sorted(waypoints, key=lambda w: float(w.get("step", 0)))
    if len(sorted_wps) == 1:
        w = sorted_wps[0]
        return float(w["arousal"]), float(w["valence"])

    t = step / max(total_steps, 1)
    n = len(sorted_wps) - 1
    pos = t * n
    i = min(int(pos), n - 1)
    frac = pos - i
    w0, w1 = sorted_wps[i], sorted_wps[i + 1]
    arousal = float(w0["arousal"]) + (float(w1["arousal"]) - float(w0["arousal"])) * frac
    valence = float(w0["valence"]) + (float(w1["valence"]) - float(w0["valence"])) * frac
    return arousal, valence
