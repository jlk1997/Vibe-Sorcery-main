import uuid

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_scope
from app.api.schemas import EmotionAnalyzeResponse
from app.core.emotion_engine import emotion_engine
from app.database import get_db
from app.models.schemas import User

router = APIRouter(prefix="/emotion", tags=["emotion"])


@router.post("/analyze", response_model=EmotionAnalyzeResponse)
async def analyze_emotion(
    file: UploadFile = File(...),
    user: User = Depends(require_scope("generate")),
):
    data = await file.read()
    suffix = "." + (file.filename or "audio.wav").split(".")[-1]
    result = emotion_engine.analyze_bytes(data, suffix=suffix)
    return EmotionAnalyzeResponse(
        moods=result["moods"],
        genres=result["genres"],
        arousal=result.get("arousal"),
        valence=result.get("valence"),
    )


@router.get("/tags")
def get_emotion_tags():
    return emotion_engine.get_tags()
