"""Copilot stream chunk helper tests."""

from app.copilot.service import _chunk_text


def test_chunk_text_splits_long_reply():
    text = "a" * 50
    chunks = _chunk_text(text, size=24)
    assert len(chunks) == 3
    assert "".join(chunks) == text


def test_chunk_text_empty():
    assert _chunk_text("") == []
