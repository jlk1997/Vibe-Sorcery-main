"""Integration-style tests for playlist job config wiring."""

import json

from app.core.journey_math import duration_from_preference, target_av_for_step


def test_playlist_music_params_duration_maps_to_orchestrator():
    assert duration_from_preference("short") == 60.0
    assert duration_from_preference("long") == 180.0


def test_waypoints_override_curve_for_step_targets():
    waypoints = [
        {"step": 1, "arousal": 2.0, "valence": 3.0},
        {"step": 3, "arousal": 9.0, "valence": 8.0},
    ]
    a1, v1 = target_av_for_step(1, 3, waypoints, "neutral")
    a3, v3 = target_av_for_step(3, 3, waypoints, "neutral")
    assert a3 > a1
    assert v3 > v1


def test_playlist_form_config_shape():
    """Simulates worker job config assembled from playlist generate fields."""
    waypoints_json = json.dumps([{"step": 0, "arousal": 3, "valence": 5}])
    music_params_json = json.dumps({"bpm_range": [90, 110], "key": "C", "duration_preference": "short"})
    journey = {"steps": 4, "target_curve": "calm_to_energy", "waypoints": json.loads(waypoints_json)}
    music_params = json.loads(music_params_json)

    assert journey["waypoints"][0]["arousal"] == 3
    assert music_params["key"] == "C"
    assert duration_from_preference(music_params["duration_preference"]) == 60.0

    job_config = {"journey": journey, "music_params": music_params}
    assert "waypoints" in job_config["journey"]
    assert job_config["music_params"]["bpm_range"][0] == 90


def test_build_playlist_job_config_seedless_prompt_journey():
    from app.api.routes.works import _build_playlist_job_config

    cfg = _build_playlist_job_config(
        journey_config={"steps": 4, "target_curve": "calm_to_energy", "waypoints": [{"step": 0, "arousal": 3, "valence": 5}]},
        music_params={"bpm_range": [80, 100], "key": "Am", "duration_preference": "medium"},
        text_intent="night city walk",
        preset_id=None,
        generation_mode="prompt_journey",
        seed_storage_key=None,
        seed_work_id=None,
        seed_filename="",
    )
    assert cfg["generation_mode"] == "prompt_journey"
    assert cfg["journey"]["mode"] == "prompt_journey"
    assert cfg["text_intent"] == "night city walk"
    assert cfg["journey"]["waypoints"][0]["valence"] == 5
    assert cfg["music_params"]["duration_preference"] == "medium"


def test_resolve_playlist_title_null_and_empty():
    from app.core.playlist_orchestrator import resolve_playlist_title

    assert resolve_playlist_title({}) == "Emotional Journey"
    assert resolve_playlist_title({"title": None}) == "Emotional Journey"
    assert resolve_playlist_title({"title": ""}) == "Emotional Journey"
    assert resolve_playlist_title({"title": "  "}) == "Emotional Journey"
    assert resolve_playlist_title({"title": "My Trip"}) == "My Trip"


def test_build_playlist_job_config_normalizes_null_title():
    from app.api.routes.works import _build_playlist_job_config

    cfg = _build_playlist_job_config(
        journey_config={"steps": 4, "title": None, "target_curve": "calm_to_energy"},
        music_params={"bpm_range": [80, 100], "key": "Am", "duration_preference": "medium"},
        text_intent="night city walk",
        preset_id=None,
        generation_mode="prompt_journey",
        seed_storage_key=None,
        seed_work_id=None,
        seed_filename="",
    )
    assert cfg["journey"]["title"] == "Emotional Journey"
