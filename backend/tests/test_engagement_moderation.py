"""Extended tests for content moderation and engagement."""

import pytest

from app.services.content_moderation import check_content_moderation, moderate_text, seed_default_words


def test_content_moderation_blocks():
    assert check_content_moderation("正常音乐分享") is None
    assert check_content_moderation("赌博网站推广") is not None


def test_moderate_text_mask_without_db():
    result = moderate_text("这人真傻逼")
    assert result.action in ("mask", "block")


@pytest.mark.requires_db
def test_moderate_text_ok_db(db):
    seed_default_words(db)
    result = moderate_text("这首曲子很治愈", db=db, scene="comment")
    assert result.action == "ok"
