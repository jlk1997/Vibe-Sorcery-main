from pydantic import BaseModel, Field

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_optional_user
from app.api.rate_limits import check_analytics_rate_limit
from app.database import get_db
from app.models.schemas import User
from app.services.analytics import track_event

router = APIRouter(prefix="/analytics", tags=["analytics"])


class TrackEventRequest(BaseModel):
    event: str = Field(min_length=1, max_length=64)
    payload: dict = Field(default_factory=dict)


@router.post("/events")
def post_event(
    body: TrackEventRequest,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    check_analytics_rate_limit(user.id if user else None, body.event[:32])
    if user and not user.analytics_consent and body.event not in ("page_view", "error"):
        return {"ok": False, "skipped": "analytics_consent_required"}
    track_event(db, body.event, user_id=user.id if user else None, payload=body.payload)
    return {"ok": True}
