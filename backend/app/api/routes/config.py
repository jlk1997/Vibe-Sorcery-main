from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.api.deps import get_optional_user
from app.config import settings
from app.core.style_presets import list_presets
from app.core.sound_recipe_options import SOUND_RECIPE_OPTIONS
from app.database import get_db
from app.integrations.minimax.client import JOURNEY_CURVES
from app.models.schemas import FeatureFlag, User
from app.services.cache import cache_get, cache_set

router = APIRouter(prefix="/config", tags=["config"])

STUDIO_CURVES = list(JOURNEY_CURVES.keys())
STUDIO_KEYS = [
    "auto",
    "C major",
    "G major",
    "D major",
    "A minor",
    "E minor",
    "F major",
    "Bb major",
]
STUDIO_BPM_PRESETS = [
    {"label": "舒缓", "range": [60, 90]},
    {"label": "适中", "range": [80, 120]},
    {"label": "明快", "range": [110, 140]},
    {"label": "激烈", "range": [130, 170]},
]
STUDIO_DURATION_OPTIONS = [
    {"value": "short", "label": "短 · 约 1 分钟"},
    {"value": "medium", "label": "中 · 约 2 分钟"},
    {"value": "long", "label": "长 · 约 3 分钟"},
]


@router.get("/presets")
def list_style_presets(category: str | None = None, db: Session = Depends(get_db)):
    cache_key = f"presets:{category or 'all'}"
    hit = cache_get(cache_key)
    if hit is not None:
        return JSONResponse(content=hit, headers={"Cache-Control": "public, max-age=300"})
    data = list_presets(db, category)
    cache_set(cache_key, data, 300)
    return JSONResponse(content=data, headers={"Cache-Control": "public, max-age=300"})


@router.get("/flags")
def public_flags(db: Session = Depends(get_db)):
    hit = cache_get("flags:public")
    if hit is not None:
        return JSONResponse(content=hit, headers={"Cache-Control": "public, max-age=60"})
    flags = db.query(FeatureFlag).all()
    data = {f.key: f.enabled for f in flags}
    cache_set("flags:public", data, 60)
    return JSONResponse(content=data, headers={"Cache-Control": "public, max-age=60"})


@router.get("/platform")
def platform_info(user: User | None = Depends(get_optional_user)):
    hit = cache_get("platform:info")
    if hit is not None:
        return JSONResponse(content=hit, headers={"Cache-Control": "public, max-age=120"})
    data = {
        "version": settings.app_version,
        "pipeline_version": settings.pipeline_version,
        "mock_ai": settings.use_mock_ai,
        "c2pa_enabled": settings.c2pa_enabled,
        "minimax": {
            "api_base": settings.minimax_api_base,
            "music_model": settings.minimax_music_model,
            "music_cover_model": settings.minimax_music_cover_model,
            "chat_model": settings.minimax_chat_model,
            "image_model": settings.minimax_image_model,
            "cover_mode_default": settings.minimax_cover_mode_default,
            "lyrics_optimizer_default": settings.minimax_lyrics_optimizer_default,
            "docs": "https://platform.minimaxi.com/docs/guides/models-intro",
        },
        "studio": {
            "curves": STUDIO_CURVES,
            "keys": STUDIO_KEYS,
            "bpm_presets": STUDIO_BPM_PRESETS,
            "duration_options": STUDIO_DURATION_OPTIONS,
            "sound_recipe": SOUND_RECIPE_OPTIONS,
            "max_lyrics_length": 3500,
            "max_steps": 12,
            "min_steps": 1,
            "default_bpm_range": [80, 120],
            "default_key": "auto",
            "default_duration": "medium",
        },
        "wechat_subscribe": {
            "job_complete": settings.wechat_tpl_job_complete,
            "low_credits": settings.wechat_tpl_low_credits,
        },
    }
    cache_set("platform:info", data, 120)
    return JSONResponse(content=data, headers={"Cache-Control": "public, max-age=120"})


@router.get("/embed")
def embed_branding(
    tenant_id: str | None = None,
    host: str | None = None,
    db: Session = Depends(get_db),
):
    from app.services.tenant import embed_branding_for_tenant, resolve_tenant_by_host

    tid = tenant_id or settings.default_tenant_id
    if host:
        resolved = resolve_tenant_by_host(db, host)
        if resolved:
            tid = resolved
    data = embed_branding_for_tenant(db, tid)
    return JSONResponse(content=data, headers={"Cache-Control": "public, max-age=120"})
