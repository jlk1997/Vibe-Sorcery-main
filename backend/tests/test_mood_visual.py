"""Tests for mood visual manifest and export helpers."""

from unittest.mock import MagicMock, patch

from app.services.mood_visual import build_mood_visual_slides, build_mood_visual_manifest


def test_build_slides_with_cover_and_moods():
    work = MagicMock()
    work.cover_url = "https://example.com/cover.png"
    work.title = "Test Song"
    work.moods = ["calm", "hope"]
    work.arousal = 5.0
    work.valence = 7.0
    work.storage_key = None
    work.audio_url = "https://example.com/audio.mp3"
    work.id = "00000000-0000-0000-0000-000000000001"

    with patch("app.api.routes.works._extract_lyrics", return_value=("line one\nline two", None)):
        slides = build_mood_visual_slides(MagicMock(), work)

    assert slides[0]["type"] == "cover"
    assert any(s["type"] == "moods" for s in slides)
    assert any(s["type"] == "lyric" for s in slides)
    assert slides[-1]["type"] == "emotion"


def test_build_manifest_includes_audio():
    work = MagicMock()
    work.cover_url = None
    work.title = "Instrumental"
    work.moods = []
    work.arousal = None
    work.valence = None
    work.storage_key = "works/u/abc.mp3"
    work.audio_url = "https://example.com/audio.mp3"
    work.id = "00000000-0000-0000-0000-000000000002"

    with patch("app.api.routes.works._extract_lyrics", return_value=(None, None)):
        with patch("app.services.mood_visual.get_storage_service") as storage_mock:
            storage_mock.return_value.get_presigned_url.return_value = "https://signed/audio.mp3"
            manifest = build_mood_visual_manifest(MagicMock(), work)

    assert manifest["audio_url"] == "https://signed/audio.mp3"
    assert manifest["work_id"] == str(work.id)
