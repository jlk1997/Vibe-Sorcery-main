import uuid

import pytest

from app.core.emotion_engine import emotion_engine
from app.database import SessionLocal
from app.models.schemas import User, Work
from app.services.reference_track import apply_reference_emotion


@pytest.mark.requires_db
def test_apply_reference_emotion_with_offset():
    db = SessionLocal()
    try:
        user = User(
            email=f"ref-{uuid.uuid4()}@test.local",
            username=f"refuser_{uuid.uuid4().hex[:8]}",
            hashed_password="x",
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        ref = Work(
            owner_id=user.id,
            title="Reference",
            audio_url="http://example/a.mp3",
            moods=["calm"],
            genres=["ambient"],
            arousal=4.0,
            valence=5.0,
        )
        db.add(ref)
        db.commit()
        db.refresh(ref)

        base = emotion_engine.infer_from_intent(text_intent="happy electronic")
        merged, ref_id = apply_reference_emotion(
            db,
            base,
            ref.id,
            av_offset={"arousal": 2, "valence": 1},
        )
        assert ref_id == ref.id
        assert merged["moods"] == ["calm"]
        assert merged["genres"] == ["ambient"]
        assert merged["arousal"] == 6.0
        assert merged["valence"] == 6.0
    finally:
        db.close()
