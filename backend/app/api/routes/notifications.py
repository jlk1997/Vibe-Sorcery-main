import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database import get_db
from app.models.schemas import User
from app.services import notifications as notification_service

router = APIRouter(prefix="/notifications", tags=["notifications"])


class MarkReadRequest(BaseModel):
    notification_id: str | None = None
    all: bool = False


@router.get("")
def get_notifications(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = notification_service.list_notifications(db, user.id)
    unread = notification_service.unread_count(db, user.id)
    return {
        "unread_count": unread,
        "items": [
            {
                "id": str(n.id),
                "type": n.type,
                "payload": n.payload or {},
                "read": n.read_at is not None,
                "created_at": n.created_at.isoformat() if n.created_at else None,
            }
            for n in rows
        ],
    }


@router.post("/read")
def mark_notifications_read(
    payload: MarkReadRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.all:
        count = notification_service.mark_all_read(db, user.id)
        return {"marked": count}
    if payload.notification_id:
        ok = notification_service.mark_read(db, user.id, uuid.UUID(payload.notification_id))
        return {"marked": 1 if ok else 0}
    return {"marked": 0}
