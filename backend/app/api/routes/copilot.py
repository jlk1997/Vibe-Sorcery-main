import json
import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.copilot import service as copilot_service
from app.database import get_db
from app.models.schemas import User
from app.services.redis_rate_limit import check_rate_limit
from app.config import settings

router = APIRouter(prefix="/copilot", tags=["copilot"])


class CopilotChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    session_id: str | None = None


@router.post("/chat")
async def copilot_chat(
    payload: CopilotChatRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_rate_limit(f"copilot:{user.id}", limit=settings.copilot_rate_limit_per_minute, window_seconds=60)
    from app.services.subscriptions import is_active_subscriber

    if not is_active_subscriber(db, user.id):
        check_rate_limit(f"copilot_daily:{user.id}", limit=10, window_seconds=86400)
    return await copilot_service.chat(db, user, payload.message, payload.session_id)


@router.post("/chat/stream")
async def copilot_chat_stream(
    payload: CopilotChatRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_rate_limit(f"copilot:{user.id}", limit=settings.copilot_rate_limit_per_minute, window_seconds=60)
    from app.services.subscriptions import is_active_subscriber

    if not is_active_subscriber(db, user.id):
        check_rate_limit(f"copilot_daily:{user.id}", limit=10, window_seconds=86400)

    async def event_stream():
        async for event in copilot_service.chat_stream(db, user, payload.message, payload.session_id):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/usage")
def copilot_usage(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.services.redis_rate_limit import get_rate_limit_count
    from app.services.subscriptions import is_active_subscriber

    is_member = is_active_subscriber(db, user.id)
    daily_limit = None if is_member else 10
    daily_used = 0 if is_member else get_rate_limit_count(f"copilot_daily:{user.id}", window_seconds=86400)
    daily_remaining = None if is_member else max(0, 10 - daily_used)
    return {
        "is_member": is_member,
        "daily_limit": daily_limit,
        "daily_used": daily_used,
        "daily_remaining": daily_remaining,
    }


@router.get("/sessions")
def copilot_sessions(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return copilot_service.list_sessions(db, user.id)


@router.get("/sessions/{session_id}")
def copilot_session_detail(
    session_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.models.schemas import StudioSession

    session = (
        db.query(StudioSession)
        .filter(StudioSession.id == uuid.UUID(session_id), StudioSession.user_id == user.id)
        .first()
    )
    if not session:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "id": str(session.id),
        "title": session.title,
        "messages": session.messages or [],
        "context": session.context or {},
    }


@router.delete("/sessions/{session_id}")
def copilot_delete_session(
    session_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from fastapi import HTTPException

    if not copilot_service.delete_session(db, user.id, session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    return {"deleted": True}
