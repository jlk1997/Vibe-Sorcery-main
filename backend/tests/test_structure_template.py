"""Tests for structure templates and derivative helpers."""

from app.core.structure_template import apply_structure_template, list_structure_templates


def test_list_structure_templates():
    templates = list_structure_templates()
    assert len(templates) >= 3
    assert any(t["id"] == "classic_arc" for t in templates)


def test_apply_structure_scales_steps():
    waypoints = apply_structure_template("classic_arc", steps=6)
    assert len(waypoints) == 6
    assert waypoints[0]["step"] == 0
    assert waypoints[-1]["step"] == 5
