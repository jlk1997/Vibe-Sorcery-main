import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_optional_user
from app.api.routes.works import work_to_response
from app.database import get_db
from app.models.schemas import Playlist, PlaylistFeedback, PlaylistSubscription, PlaylistTrack, User, Work

router = APIRouter(prefix="/playlists", tags=["playlists"])


class PlaylistUpdateRequest(BaseModel):
    visibility: str | None = Field(default=None, pattern="^(public|private|unlisted)$")
    title: str | None = Field(default=None, min_length=1, max_length=255)


def _track_counts(db: Session, playlist_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    if not playlist_ids:
        return {}
    rows = (
        db.query(PlaylistTrack.playlist_id, func.count(PlaylistTrack.id))
        .filter(PlaylistTrack.playlist_id.in_(playlist_ids))
        .group_by(PlaylistTrack.playlist_id)
        .all()
    )
    return {pid: int(cnt) for pid, cnt in rows}


def _build_track_list(db: Session, tracks: list[PlaylistTrack], *, owner_ok: bool = True) -> list[dict]:
    if not tracks:
        return []
    work_ids = [t.work_id for t in tracks]
    works = {w.id: w for w in db.query(Work).filter(Work.id.in_(work_ids)).all()}
    total = len(tracks)
    out: list[dict] = []
    for t in sorted(tracks, key=lambda x: x.position):
        work = works.get(t.work_id)
        if not work:
            continue
        if not owner_ok and work.visibility == "private":
            continue
        out.append(
            {
                "position": t.position,
                "shift_stage": _shift_stage(t.position + 1, total),
                "work": work_to_response(work),
            }
        )
    return out


@router.get("/discover/public")
def list_public_playlists(db: Session = Depends(get_db), limit: int = 30):
    from app.models.schemas import User

    playlists = (
        db.query(Playlist)
        .filter(Playlist.visibility == "public")
        .order_by(Playlist.created_at.desc())
        .limit(min(max(limit, 1), 50))
        .all()
    )
    if not playlists:
        return []
    owner_ids = list({p.owner_id for p in playlists})
    owners = {u.id: u.username for u in db.query(User).filter(User.id.in_(owner_ids)).all()}
    counts = _track_counts(db, [p.id for p in playlists])
    return [
        {
            "id": str(p.id),
            "title": p.title,
            "owner_username": owners.get(p.owner_id),
            "track_count": counts.get(p.id, 0),
            "visibility": p.visibility,
        }
        for p in playlists
    ]


@router.get("/subscriptions")
def list_playlist_subscriptions(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.models.schemas import User as UserModel

    subs = (
        db.query(PlaylistSubscription)
        .filter(PlaylistSubscription.user_id == user.id)
        .order_by(PlaylistSubscription.created_at.desc())
        .all()
    )
    if not subs:
        return []
    playlist_ids = [s.playlist_id for s in subs]
    playlists = {p.id: p for p in db.query(Playlist).filter(Playlist.id.in_(playlist_ids)).all()}
    owner_ids = list({p.owner_id for p in playlists.values()})
    owners = {u.id: u.username for u in db.query(UserModel).filter(UserModel.id.in_(owner_ids)).all()}
    counts = _track_counts(db, playlist_ids)
    return [
        {
            "id": str(pid),
            "title": playlists[pid].title,
            "owner_username": owners.get(playlists[pid].owner_id),
            "track_count": counts.get(pid, 0),
            "visibility": playlists[pid].visibility,
            "subscribed_at": next((s.created_at.isoformat() for s in subs if s.playlist_id == pid), None),
        }
        for pid in playlist_ids
        if pid in playlists
    ]


@router.post("/{playlist_id}/subscribe")
def subscribe_playlist(
    playlist_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    playlist = db.query(Playlist).filter(Playlist.id == uuid.UUID(playlist_id)).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    if playlist.owner_id == user.id:
        raise HTTPException(status_code=400, detail="Cannot subscribe to your own playlist")
    if playlist.visibility != "public":
        raise HTTPException(status_code=403, detail="Playlist is not public")
    existing = (
        db.query(PlaylistSubscription)
        .filter(PlaylistSubscription.user_id == user.id, PlaylistSubscription.playlist_id == playlist.id)
        .first()
    )
    if existing:
        return {"subscribed": True, "playlist_id": str(playlist.id)}
    db.add(PlaylistSubscription(user_id=user.id, playlist_id=playlist.id))
    db.commit()
    return {"subscribed": True, "playlist_id": str(playlist.id)}


@router.delete("/{playlist_id}/subscribe")
def unsubscribe_playlist(
    playlist_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = (
        db.query(PlaylistSubscription)
        .filter(
            PlaylistSubscription.user_id == user.id,
            PlaylistSubscription.playlist_id == uuid.UUID(playlist_id),
        )
        .first()
    )
    if row:
        db.delete(row)
        db.commit()
    return {"subscribed": False}


@router.get("")
def list_playlists(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    playlists = db.query(Playlist).filter(Playlist.owner_id == user.id).order_by(Playlist.created_at.desc()).all()
    counts = _track_counts(db, [p.id for p in playlists])
    return [
        {
            "id": str(p.id),
            "title": p.title,
            "visibility": p.visibility,
            "journey_config": p.journey_config,
            "track_count": counts.get(p.id, 0),
        }
        for p in playlists
    ]


@router.get("/{playlist_id}")
def get_playlist(
    playlist_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    playlist = db.query(Playlist).filter(
        Playlist.id == uuid.UUID(playlist_id),
        Playlist.owner_id == user.id,
    ).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")

    tracks = (
        db.query(PlaylistTrack)
        .filter(PlaylistTrack.playlist_id == playlist.id)
        .order_by(PlaylistTrack.position.asc())
        .all()
    )
    jc = playlist.journey_config or {}
    return {
        "id": str(playlist.id),
        "title": playlist.title,
        "visibility": playlist.visibility,
        "journey_config": jc,
        "share_text": jc.get("share_text"),
        "tracks": _build_track_list(db, tracks),
    }


@router.patch("/{playlist_id}")
def update_playlist(
    playlist_id: str,
    payload: PlaylistUpdateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    playlist = db.query(Playlist).filter(
        Playlist.id == uuid.UUID(playlist_id),
        Playlist.owner_id == user.id,
    ).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    if payload.visibility is not None:
        playlist.visibility = payload.visibility
    if payload.title is not None:
        playlist.title = payload.title.strip()
    db.commit()
    db.refresh(playlist)
    return {
        "id": str(playlist.id),
        "title": playlist.title,
        "visibility": playlist.visibility,
    }


@router.get("/{playlist_id}/public")
def get_public_playlist(
    playlist_id: str,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    playlist = db.query(Playlist).filter(Playlist.id == uuid.UUID(playlist_id)).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    is_owner = user is not None and playlist.owner_id == user.id
    if playlist.visibility == "private" and not is_owner:
        raise HTTPException(status_code=403, detail="Playlist is private")
    if playlist.visibility not in ("public", "unlisted", "private"):
        raise HTTPException(status_code=403, detail="Playlist is not published")

    tracks = (
        db.query(PlaylistTrack)
        .filter(PlaylistTrack.playlist_id == playlist.id)
        .order_by(PlaylistTrack.position.asc())
        .all()
    )
    jc = playlist.journey_config or {}
    return {
        "id": str(playlist.id),
        "title": playlist.title,
        "visibility": playlist.visibility,
        "share_text": jc.get("share_text"),
        "tracks": _build_track_list(db, tracks, owner_ok=is_owner),
    }


class PlaylistFeedbackRequest(BaseModel):
    mood_before: float = Field(ge=1, le=9)
    mood_after: float = Field(ge=1, le=9)
    felt_shift: bool = True
    note: str | None = Field(default=None, max_length=500)


def _shift_stage(step: int, total: int) -> str:
    if step <= 1:
        return "起点"
    if step >= total:
        return "终点"
    return "过渡"


@router.post("/{playlist_id}/feedback")
def submit_playlist_feedback(
    playlist_id: str,
    payload: PlaylistFeedbackRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    playlist = db.query(Playlist).filter(
        Playlist.id == uuid.UUID(playlist_id),
        Playlist.owner_id == user.id,
    ).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")

    existing = (
        db.query(PlaylistFeedback)
        .filter(PlaylistFeedback.playlist_id == playlist.id, PlaylistFeedback.user_id == user.id)
        .first()
    )
    if existing:
        existing.mood_before = payload.mood_before
        existing.mood_after = payload.mood_after
        existing.felt_shift = payload.felt_shift
        existing.note = payload.note
        db.commit()
        return {"id": str(existing.id)}

    row = PlaylistFeedback(
        playlist_id=playlist.id,
        user_id=user.id,
        mood_before=payload.mood_before,
        mood_after=payload.mood_after,
        felt_shift=payload.felt_shift,
        note=payload.note,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    from app.services.user_engagement import complete_task
    from app.services.credits import credits_snapshot

    task_result = complete_task(db, user.id, "journey_feedback")
    return {"id": str(row.id), **credits_snapshot(db, user.id, task_result=task_result)}


@router.get("/{playlist_id}/feedback")
def get_playlist_feedback(
    playlist_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = (
        db.query(PlaylistFeedback)
        .filter(
            PlaylistFeedback.playlist_id == uuid.UUID(playlist_id),
            PlaylistFeedback.user_id == user.id,
        )
        .first()
    )
    if not row:
        return None
    return {
        "mood_before": row.mood_before,
        "mood_after": row.mood_after,
        "felt_shift": row.felt_shift,
        "note": row.note,
    }
