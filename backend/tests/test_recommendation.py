"""Recommendation reason helper tests."""

import uuid

from app.models.schemas import Post, Work
from app.services.recommendation import explain_post_recommendation, rank_posts_with_context


def test_explain_following():
    author_id = uuid.uuid4()
    post = Post(id=uuid.uuid4(), work_id=uuid.uuid4(), author_id=author_id, like_count=0, comment_count=0)
    work = Work(id=post.work_id, owner_id=author_id, title="T", audio_url="http://x/a.mp3")
    reason = explain_post_recommendation(
        post,
        work,
        moods=[],
        genres=[],
        following_ids={author_id},
        work_embs={},
        user_emb=None,
    )
    assert reason == "following"


def test_explain_mood_overlap():
    post = Post(id=uuid.uuid4(), work_id=uuid.uuid4(), author_id=uuid.uuid4(), like_count=0, comment_count=0)
    work = Work(id=post.work_id, owner_id=post.author_id, title="T", audio_url="http://x/a.mp3", moods=["lo-fi", "calm"])
    reason = explain_post_recommendation(
        post,
        work,
        moods=["calm", "focus"],
        genres=[],
        following_ids=set(),
        work_embs={},
        user_emb=None,
    )
    assert reason == "mood:calm"


def test_rank_posts_with_context_latest_no_db():
    post = Post(id=uuid.uuid4(), work_id=uuid.uuid4(), author_id=uuid.uuid4(), like_count=0, comment_count=0)
    ranked, ctx = rank_posts_with_context(None, [post], None, sort="latest")
    assert ranked == [post]
    assert ctx is None
