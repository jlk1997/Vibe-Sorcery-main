import asyncio
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.schemas import JobResponse
from app.config import settings
from app.database import SessionLocal, get_db
from app.models.schemas import GenerationJob, User, Work
from app.services.auth import decode_token
from app.services.job_progress import job_to_response
from app.services.job_state import ACTIVE_JOB_STATUSES, cancel_job_state

router = APIRouter(prefix="/jobs", tags=["jobs"])

TERMINAL_JOB_STATUSES = ("completed", "failed", "cancelled")


def _job_stream_payload(job: GenerationJob, db: Session) -> dict:
    from app.services.job_events import job_payload_dict

    return job_payload_dict(job, db)


def _payload_key(payload: dict) -> str:
    return f"{payload['status']}|{payload['progress']}|{payload.get('phase')}|{payload.get('current_step')}|{payload.get('version')}"


async def _send_job_snapshot(websocket: WebSocket, job_uuid: uuid.UUID, owner_id: uuid.UUID) -> dict | None:
    db = SessionLocal()
    try:
        job = db.query(GenerationJob).filter(
            GenerationJob.id == job_uuid,
            GenerationJob.owner_id == owner_id,
        ).first()
        if not job:
            await websocket.send_json({"error": "Job not found"})
            return None
        payload = _job_stream_payload(job, db)
        await websocket.send_json(payload)
        return payload
    finally:
        db.close()


async def _stream_job_updates(websocket: WebSocket, job_uuid: uuid.UUID, owner_id: uuid.UUID) -> None:
    payload = await _send_job_snapshot(websocket, job_uuid, owner_id)
    if payload is None:
        return
    if payload["status"] in TERMINAL_JOB_STATUSES:
        return

    from app.services.job_events import subscribe_job_channel

    pubsub = subscribe_job_channel(job_uuid)
    last_key = _payload_key(payload)

    if pubsub is None:
        while True:
            await asyncio.sleep(2)
            db = SessionLocal()
            try:
                job = db.query(GenerationJob).filter(
                    GenerationJob.id == job_uuid,
                    GenerationJob.owner_id == owner_id,
                ).first()
                if not job:
                    break
                next_payload = _job_stream_payload(job, db)
            finally:
                db.close()
            key = _payload_key(next_payload)
            if key != last_key:
                await websocket.send_json(next_payload)
                last_key = key
            if next_payload["status"] in TERMINAL_JOB_STATUSES:
                break
        return

    try:
        while True:
            msg = pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if msg and msg.get("type") == "message":
                import json

                data = json.loads(msg["data"])
                key = _payload_key(data)
                if key != last_key:
                    await websocket.send_json(data)
                    last_key = key
                if data.get("status") in TERMINAL_JOB_STATUSES:
                    break
            else:
                await asyncio.sleep(0.05)
    finally:
        try:
            pubsub.unsubscribe()
            pubsub.close()
        except Exception:
            pass


@router.get("/active", response_model=JobResponse | None)
def get_active_job(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = (
        db.query(GenerationJob)
        .filter(
            GenerationJob.owner_id == user.id,
            GenerationJob.status.in_(ACTIVE_JOB_STATUSES),
        )
        .order_by(GenerationJob.updated_at.desc())
        .first()
    )
    if not job:
        return None
    return job_to_response(job, db)


class PickVariationRequest(BaseModel):
    work_id: str


@router.post("/{job_id}/pick-variation", response_model=JobResponse)
def pick_variation(
    job_id: str,
    payload: PickVariationRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        job_uuid = uuid.UUID(job_id)
        pick_uuid = uuid.UUID(payload.work_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid id") from exc

    job = db.query(GenerationJob).filter(
        GenerationJob.id == job_uuid,
        GenerationJob.owner_id == user.id,
    ).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.job_type not in ("variations", "single"):
        raise HTTPException(status_code=400, detail="Not a variation or preview job")

    work_ids = (job.result or {}).get("work_ids") or []
    if payload.work_id not in work_ids:
        raise HTTPException(status_code=400, detail="Work not in variation set")

    primary = db.query(Work).filter(Work.id == pick_uuid, Work.owner_id == user.id).first()
    if not primary:
        raise HTTPException(status_code=404, detail="Work not found")

    base_title = (primary.title or "变体").replace(" (主版本)", "").split("#")[0].strip()
    primary.title = f"{base_title} (主版本)"

    for wid in work_ids:
        if wid == payload.work_id:
            continue
        variant = db.query(Work).filter(Work.id == uuid.UUID(wid)).first()
        if variant:
            variant.parent_work_id = pick_uuid

    result = dict(job.result or {})
    result["primary_work_id"] = payload.work_id
    job.result = result
    db.commit()
    db.refresh(job)
    return job_to_response(job, db)


@router.get("/{job_id}", response_model=JobResponse)
def get_job(
    job_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        job_uuid = uuid.UUID(job_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid job id") from exc
    job = db.query(GenerationJob).filter(
        GenerationJob.id == job_uuid,
        GenerationJob.owner_id == user.id,
    ).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job_to_response(job, db)


@router.post("/{job_id}/cancel")
def cancel_job(
    job_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        job_uuid = uuid.UUID(job_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid job id") from exc
    job = db.query(GenerationJob).filter(
        GenerationJob.id == job_uuid,
        GenerationJob.owner_id == user.id,
    ).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status in ("completed", "failed", "cancelled"):
        return job_to_response(job, db)
    cancel_job_state(db, job)
    db.refresh(job)
    return job_to_response(job, db)


@router.post("/{job_id}/stream-ticket")
def create_stream_ticket(
    job_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        job_uuid = uuid.UUID(job_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid job id") from exc
    job = db.query(GenerationJob).filter(
        GenerationJob.id == job_uuid,
        GenerationJob.owner_id == user.id,
    ).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    from app.services.stream_tickets import issue_stream_ticket

    ticket = issue_stream_ticket(str(user.id), job_id)
    return {"ticket": ticket, "expires_in": settings.ws_stream_ticket_ttl_seconds}


@router.websocket("/{job_id}/stream")
async def job_stream(
    websocket: WebSocket,
    job_id: str,
    ticket: str | None = Query(None),
    token: str | None = Query(None),
):
    await websocket.accept()
    owner_id: uuid.UUID | None = None

    if ticket:
        from app.services.stream_tickets import consume_stream_ticket

        consumed = consume_stream_ticket(ticket)
        if consumed:
            user_id, ticket_job_id = consumed
            if ticket_job_id == job_id:
                try:
                    owner_id = uuid.UUID(user_id)
                except ValueError:
                    owner_id = None
    elif token and settings.debug:
        user_sub = decode_token(token)
        if user_sub:
            try:
                owner_id = uuid.UUID(user_sub)
            except ValueError:
                owner_id = None

    if not owner_id:
        await websocket.send_json({"error": "Unauthorized"})
        await websocket.close()
        return
    try:
        job_uuid = uuid.UUID(job_id)
    except ValueError:
        await websocket.send_json({"error": "Invalid token or job id"})
        await websocket.close()
        return

    try:
        await _stream_job_updates(websocket, job_uuid, owner_id)
    except WebSocketDisconnect:
        pass
