"""Protected media playback tickets and gateway URLs."""

import uuid

import pytest

from app.models.schemas import User, Work
from app.services.media_playback import (
    issue_playback_ticket,
    consume_playback_ticket,
    protected_stream_url,
    rewrite_hls_playlist_for_gateway,
    validate_playback_access,
    is_safe_segment_name,
)


def test_issue_and_consume_ticket():
    wid = str(uuid.uuid4())
    ticket = issue_playback_ticket(wid, None)
    data = consume_playback_ticket(ticket, work_id=wid)
    assert data is not None
    assert data["work_id"] == wid
    assert consume_playback_ticket(ticket, work_id=str(uuid.uuid4())) is None


def test_protected_stream_url_uses_gateway():
    work = Work(id=uuid.uuid4(), title="T", audio_url="http://x/a.mp3", storage_key="works/u/a.mp3")
    url = protected_stream_url(work, None)
    assert "/works/" in url
    assert "/stream?" in url
    assert "ticket=" in url
    assert "X-Amz" not in url


def test_rewrite_hls_playlist_uses_segments_proxy():
    m3u8 = "#EXTM3U\n#EXTINF:6.0,\nseg_000.ts\n"
    out = rewrite_hls_playlist_for_gateway(m3u8, work_id="abc", ticket="tok123")
    assert "/hls/segments/seg_000.ts" in out
    assert "ticket=tok123" in out
    assert "X-Amz" not in out


def test_segment_name_validation():
    assert is_safe_segment_name("seg_000.ts")
    assert not is_safe_segment_name("../etc/passwd")
    assert not is_safe_segment_name("seg_000.mp3")


@pytest.mark.requires_db
def test_validate_playback_public_work_anon_ticket(db):
    owner_id = uuid.uuid4()
    work_id = uuid.uuid4()
    try:
        owner = User(
            id=owner_id,
            email=f"o-{uuid.uuid4().hex[:8]}@test.local",
            username=f"o_{uuid.uuid4().hex[:8]}",
            hashed_password="x",
        )
        db.add(owner)
        work = Work(
            id=work_id,
            owner_id=owner_id,
            title="Public",
            audio_url="http://x/a.mp3",
            visibility="public",
            storage_key="works/test/a.mp3",
        )
        db.add(work)
        db.commit()
        ticket = issue_playback_ticket(str(work_id), None)
        validate_playback_access(db, work, ticket=ticket, user=None)
    finally:
        db.query(Work).filter(Work.id == work_id).delete()
        db.query(User).filter(User.id == owner_id).delete()
        db.commit()
