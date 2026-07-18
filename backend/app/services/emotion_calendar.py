"""Emotion calendar — daily mood journal and monthly album."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models.schemas import EmotionJournalEntry, Playlist, PlaylistTrack, User, Work


def log_entry(
    db: Session,
    user_id: uuid.UUID,
    *,
    work_id: str | None = None,
    arousal: float | None = None,
    valence: float | None = None,
    mood_tags: list[str] | None = None,
    note: str | None = None,
    entry_date: date | None = None,
) -> dict[str, Any]:
    today = entry_date or date.today()
    wid = None
    if work_id:
        try:
            wid = uuid.UUID(work_id)
        except ValueError:
            wid = None
    if wid and (arousal is None or valence is None):
        work = db.query(Work).filter(Work.id == wid, Work.owner_id == user_id).first()
        if work:
            arousal = arousal if arousal is not None else work.arousal
            valence = valence if valence is not None else work.valence
            mood_tags = mood_tags or (work.moods or [])

    row = EmotionJournalEntry(
        user_id=user_id,
        entry_date=today,
        arousal=arousal,
        valence=valence,
        work_id=wid,
        mood_tags=mood_tags or [],
        note=note,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _entry_dict(row)


def list_entries(db: Session, user_id: uuid.UUID, *, days: int = 60) -> list[dict[str, Any]]:
    from datetime import timedelta

    since = date.today() - timedelta(days=max(7, min(days, 365)))
    rows = (
        db.query(EmotionJournalEntry)
        .filter(EmotionJournalEntry.user_id == user_id, EmotionJournalEntry.entry_date >= since)
        .order_by(EmotionJournalEntry.entry_date.desc(), EmotionJournalEntry.created_at.desc())
        .all()
    )
    return [_entry_dict(r) for r in rows]


def _emotion_album_tag(year: int, month: int) -> str:
    return f"emotion_album_{year}_{month:02d}"


def ensure_monthly_playlist(
    db: Session,
    user_id: uuid.UUID,
    *,
    year: int,
    month: int,
    title: str,
    work_ids: list[str],
) -> str | None:
    """Create or refresh a private playlist from monthly emotion journal works."""
    if not work_ids:
        return None
    tag = _emotion_album_tag(year, month)

    existing = db.query(Playlist).filter(Playlist.owner_id == user_id).all()
    playlist: Playlist | None = None
    for row in existing:
        jc = row.journey_config or {}
        if jc.get("emotion_album_tag") == tag:
            playlist = row
            break

    if playlist is None:
        playlist = Playlist(
            owner_id=user_id,
            title=title,
            journey_config={
                "type": "emotion_album",
                "emotion_album_tag": tag,
                "year": year,
                "month": month,
                "share_text": f"我的{year}年{month}月情绪专辑",
            },
            visibility="private",
        )
        db.add(playlist)
        db.flush()
    else:
        playlist.title = title
        db.query(PlaylistTrack).filter(PlaylistTrack.playlist_id == playlist.id).delete()

    for i, wid in enumerate(work_ids):
        try:
            work_uuid = uuid.UUID(wid)
        except ValueError:
            continue
        db.add(PlaylistTrack(playlist_id=playlist.id, work_id=work_uuid, position=i + 1))
    db.commit()
    return str(playlist.id)


def monthly_album(db: Session, user_id: uuid.UUID, *, year: int | None = None, month: int | None = None) -> dict[str, Any]:
    today = date.today()
    year = year or today.year
    month = month or today.month
    start = date(year, month, 1)
    end = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    rows = (
        db.query(EmotionJournalEntry)
        .filter(
            EmotionJournalEntry.user_id == user_id,
            EmotionJournalEntry.entry_date >= start,
            EmotionJournalEntry.entry_date < end,
            EmotionJournalEntry.work_id.isnot(None),
        )
        .order_by(EmotionJournalEntry.entry_date.asc())
        .all()
    )
    work_ids = [str(r.work_id) for r in rows if r.work_id]
    works = {str(w.id): w for w in db.query(Work).filter(Work.id.in_([r.work_id for r in rows if r.work_id])).all()}
    tracks = []
    for r in rows:
        if not r.work_id:
            continue
        w = works.get(str(r.work_id))
        if w:
            tracks.append({"work_id": str(w.id), "title": w.title, "date": r.entry_date.isoformat(), "cover_url": w.cover_url})
    avg_a = sum(r.arousal or 0 for r in rows) / max(len(rows), 1)
    avg_v = sum(r.valence or 0 for r in rows) / max(len(rows), 1)
    title = f"{year}年{month}月情绪专辑"
    playlist_id = (
        ensure_monthly_playlist(db, user_id, year=year, month=month, title=title, work_ids=work_ids)
        if work_ids
        else None
    )
    return {
        "year": year,
        "month": month,
        "title": title,
        "track_count": len(tracks),
        "work_ids": work_ids,
        "tracks": tracks,
        "avg_arousal": round(avg_a, 2),
        "avg_valence": round(avg_v, 2),
        "playlist_id": playlist_id,
    }


def _entry_dict(row: EmotionJournalEntry) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "entry_date": row.entry_date.isoformat(),
        "arousal": row.arousal,
        "valence": row.valence,
        "work_id": str(row.work_id) if row.work_id else None,
        "mood_tags": row.mood_tags or [],
        "note": row.note,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }
