"""Challenge lifecycle: ends_at defaults and rank score alignment."""

import uuid
from datetime import datetime, timedelta

import pytest

from app.models.schemas import Challenge, ChallengeEntry, Post, User, Work
from app.services.challenge_awards import challenge_entry_rank_score, distribute_challenge_prizes


@pytest.mark.requires_db
def test_create_challenge_sets_ends_at(db):
    from app.api.routes.challenges import ChallengeCreate, create_challenge

    admin = User(
        id=uuid.uuid4(),
        email=f"admin-{uuid.uuid4().hex[:8]}@test.local",
        username=f"admin_{uuid.uuid4().hex[:8]}",
        hashed_password="x",
        is_admin=True,
    )
    db.add(admin)
    db.commit()

    slug = f"test-{uuid.uuid4().hex[:8]}"
    payload = ChallengeCreate(
        slug=slug,
        title="Test Challenge",
        hashtag="TestTag",
        duration_days=7,
        prize_pool_credits=10,
    )
    result = create_challenge(payload, user=admin, db=db)
    c = db.query(Challenge).filter(Challenge.slug == result["slug"]).first()
    assert c is not None
    assert c.ends_at is not None
    assert c.ends_at > datetime.utcnow()
    assert c.ends_at <= datetime.utcnow() + timedelta(days=8)


def test_rank_score_matches_award_logic():
    challenge = Challenge(ends_at=datetime.utcnow() + timedelta(days=7))
    post = Post(like_count=10, created_at=datetime.utcnow() - timedelta(hours=12))
    score = challenge_entry_rank_score(challenge, post)
    assert score > 10


@pytest.mark.requires_db
def test_leaderboard_rank_score_order(db):
    user = User(
        id=uuid.uuid4(),
        email=f"u-{uuid.uuid4().hex[:8]}@test.local",
        username=f"u_{uuid.uuid4().hex[:8]}",
        hashed_password="x",
    )
    db.add(user)
    db.commit()

    challenge = Challenge(
        slug=f"rank-{uuid.uuid4().hex[:8]}",
        title="Rank Test",
        hashtag="Rank",
        ends_at=datetime.utcnow() + timedelta(days=3),
        prize_pool_credits=0,
        awards_distributed=True,
        is_active=False,
    )
    db.add(challenge)
    db.flush()

    work_a = Work(id=uuid.uuid4(), owner_id=user.id, title="A", audio_url="http://x/a.mp3")
    work_b = Work(id=uuid.uuid4(), owner_id=user.id, title="B", audio_url="http://x/b.mp3")
    db.add_all([work_a, work_b])
    db.flush()

    post_a = Post(
        author_id=user.id,
        work_id=work_a.id,
        challenge_id=challenge.id,
        visibility="public",
        like_count=5,
        created_at=datetime.utcnow() - timedelta(hours=72),
    )
    post_b = Post(
        author_id=user.id,
        work_id=work_b.id,
        challenge_id=challenge.id,
        visibility="public",
        like_count=8,
        created_at=datetime.utcnow() - timedelta(hours=2),
    )
    db.add_all([post_a, post_b])
    db.add(ChallengeEntry(challenge_id=challenge.id, work_id=work_a.id, user_id=user.id))
    db.add(ChallengeEntry(challenge_id=challenge.id, work_id=work_b.id, user_id=user.id))
    db.commit()

    score_a = challenge_entry_rank_score(challenge, post_a)
    score_b = challenge_entry_rank_score(challenge, post_b)
    assert score_b > score_a
