import pytest

from app.core.journey_math import duration_from_preference, target_av_for_step


def test_duration_from_preference():
    assert duration_from_preference("short") == 60.0
    assert duration_from_preference("medium") == 120.0
    assert duration_from_preference("long") == 180.0
    assert duration_from_preference("unknown") == 120.0


def test_target_av_curve_interpolation():
    a1, v1 = target_av_for_step(1, 4, None, "calm_to_energy")
    a4, v4 = target_av_for_step(4, 4, None, "calm_to_energy")
    assert a4 > a1
    assert v4 >= v1


def test_target_av_waypoints():
    waypoints = [
        {"step": 0, "arousal": 2.0, "valence": 3.0},
        {"step": 1, "arousal": 8.0, "valence": 8.0},
    ]
    a1, v1 = target_av_for_step(1, 2, waypoints, "neutral")
    a2, v2 = target_av_for_step(2, 2, waypoints, "neutral")
    assert a2 >= a1
    assert v2 >= v1
