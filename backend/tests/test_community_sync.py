"""Community caption sync when work title changes."""

from app.models.schemas import Post
from app.services.community_sync import should_sync_post_caption


def _post(caption: str | None) -> Post:
    return Post(caption=caption, author_id=None, work_id=None)


def test_sync_when_caption_empty():
    assert should_sync_post_caption(_post(None), "Old", force=None) is True
    assert should_sync_post_caption(_post("  "), "Old", force=None) is True


def test_sync_when_caption_matches_old_title():
    assert should_sync_post_caption(_post("Old"), "Old", force=None) is True
    assert should_sync_post_caption(_post(" Old "), "Old", force=None) is True


def test_skip_when_custom_caption():
    assert should_sync_post_caption(_post("My custom story"), "Old", force=None) is False


def test_force_override():
    assert should_sync_post_caption(_post("My custom story"), "Old", force=True) is True
    assert should_sync_post_caption(_post("Old"), "Old", force=False) is False
