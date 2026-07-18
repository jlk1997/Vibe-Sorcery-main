"""Tests for duel resonance helpers and lifecycle."""

import uuid
from datetime import date

import pytest

from app.models.schemas import Duel, DuelVote, Notification, Post, User, UserCredit, CreditTransaction, UserDuelQuota, Work
from app.services.duels import EMOTION_TAG_MOODS, accept_duel, cast_duel_vote, create_duel, settle_duel


def test_emotion_tag_moods_has_core_keys():
    assert "calm" in EMOTION_TAG_MOODS
    assert "joy" in EMOTION_TAG_MOODS
    assert len(EMOTION_TAG_MOODS) >= 4


@pytest.mark.requires_db
def test_duel_create_accept_vote_settle(db):
    challenger_id = uuid.uuid4()
    opponent_id = uuid.uuid4()
    voter_id = uuid.uuid4()
    ch_work_id = uuid.uuid4()
    op_work_id = uuid.uuid4()
    duel_id_holder: list[uuid.UUID] = []
    try:
        challenger = User(
            id=challenger_id,
            email=f"ch-{uuid.uuid4().hex[:8]}@test.local",
            username=f"ch_{uuid.uuid4().hex[:8]}",
            hashed_password="x",
        )
        opponent = User(
            id=opponent_id,
            email=f"op-{uuid.uuid4().hex[:8]}@test.local",
            username=f"op_{uuid.uuid4().hex[:8]}",
            hashed_password="x",
        )
        voter = User(
            id=voter_id,
            email=f"v-{uuid.uuid4().hex[:8]}@test.local",
            username=f"v_{uuid.uuid4().hex[:8]}",
            hashed_password="x",
        )
        db.add_all([challenger, opponent, voter])
        db.flush()

        ch_work = Work(id=ch_work_id, owner_id=challenger_id, title="Challenger", audio_url="http://x/a.mp3")
        op_work = Work(id=op_work_id, owner_id=opponent_id, title="Opponent", audio_url="http://x/b.mp3")
        db.add_all([ch_work, op_work])
        db.flush()

        db.add(
            Post(author_id=challenger_id, work_id=ch_work_id, visibility="public", caption="Challenger post")
        )
        db.add(Post(author_id=opponent_id, work_id=op_work_id, visibility="public", caption="Opponent post"))
        db.add(
            UserDuelQuota(
                user_id=challenger_id,
                quota_date=date.today(),
                pass_starts_remaining=2,
            )
        )
        db.commit()

        created = create_duel(
            db,
            challenger,
            work_id=str(ch_work_id),
            opponent_username=opponent.username,
        )
        assert created["status"] == "pending"
        duel_id = uuid.UUID(created["duel_id"])
        duel_id_holder.append(duel_id)

        accepted = accept_duel(db, opponent, str(duel_id), work_id=str(op_work_id))
        assert accepted["status"] == "voting"

        voted = cast_duel_vote(db, voter, str(duel_id), side="a", listen_ratio=0.8, emotion_tag="joy")
        assert voted["voted"] is True

        duel = db.query(Duel).filter(Duel.id == duel_id).first()
        assert duel is not None
        result = settle_duel(db, duel)
        assert result.get("settled") is True
        db.refresh(duel)
        assert duel.status in ("settled", "draw")
    finally:
        if duel_id_holder:
            did = duel_id_holder[0]
            db.query(DuelVote).filter(DuelVote.duel_id == did).delete()
            db.query(Duel).filter(Duel.id == did).delete()
        user_ids = [challenger_id, opponent_id, voter_id]
        db.query(Notification).filter(Notification.user_id.in_(user_ids)).delete()
        db.query(CreditTransaction).filter(CreditTransaction.user_id.in_(user_ids)).delete()
        db.query(UserCredit).filter(UserCredit.user_id.in_(user_ids)).delete()
        db.query(UserDuelQuota).filter(UserDuelQuota.user_id == challenger_id).delete()
        db.query(Post).filter(Post.work_id.in_([ch_work_id, op_work_id])).delete()
        db.query(Work).filter(Work.id.in_([ch_work_id, op_work_id])).delete()
        db.query(User).filter(User.id.in_([challenger_id, opponent_id, voter_id])).delete()
        db.commit()
