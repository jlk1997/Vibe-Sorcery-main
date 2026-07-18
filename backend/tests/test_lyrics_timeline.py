"""Lyrics timeline parsing tests."""

from app.services.lyrics_timeline import build_lyrics_timeline, parse_lrc_timeline


def test_parse_lrc_timeline():
    text = """[00:12.50]第一句歌词
[00:25.00]第二句歌词
[ar:Artist]"""
    timeline = parse_lrc_timeline(text)
    assert len(timeline) == 2
    assert timeline[0]["text"] == "第一句歌词"
    assert abs(timeline[0]["time"] - 12.5) < 0.01
    assert timeline[1]["time"] == 25.0


def test_build_lyrics_timeline_prefers_embedded():
    embedded = [{"time": 5.0, "text": "Hello"}, {"time": 10.0, "text": "World"}]
    lyrics, timeline = build_lyrics_timeline(None, duration=60, embedded_timeline=embedded)
    assert lyrics == "Hello\nWorld"
    assert timeline == embedded


def test_build_lyrics_timeline_plain_fallback():
    lyrics, timeline = build_lyrics_timeline("Line one\nLine two", duration=60)
    assert lyrics == "Line one\nLine two"
    assert timeline and len(timeline) == 2
