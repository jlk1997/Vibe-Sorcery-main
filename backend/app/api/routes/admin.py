import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_admin
from app.config import settings
from app.services.credits import add_credits
from app.database import get_db
from app.models.schemas import (
    ApiUsageLog,
    Challenge,
    Comment,
    FeatureFlag,
    GenerationJob,
    Post,
    Report,
    StylePreset,
    User,
    Work,
)

router = APIRouter(prefix="/admin", tags=["admin"])


class FeatureFlagUpdate(BaseModel):
    enabled: bool
    config: dict | None = None


class ReportResolve(BaseModel):
    status: str = "resolved"
    action: str | None = None


class CreditGrantRequest(BaseModel):
    email: str | None = None
    user_id: str | None = None
    amount: int = Field(gt=0, le=100_000)


class TenantAssignRequest(BaseModel):
    tenant_id: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9._-]+$")


class TenantCreateRequest(BaseModel):
    tenant_id: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9._-]+$")
    name: str = Field(min_length=1, max_length=255)
    plan: str = Field(default="free", pattern=r"^(free|member|team|enterprise)$")
    invite_code: str | None = Field(default=None, max_length=32)
    initial_credits: int = Field(default=0, ge=0, le=100000)


class TenantPoolGrantRequest(BaseModel):
    amount: int = Field(gt=0, le=100000)


class StylePresetUpsert(BaseModel):
    id: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9._-]+$")
    label: str = Field(min_length=1, max_length=255)
    category: str = Field(default="scene", max_length=64)
    description: str | None = None
    example_intent: str | None = None
    moods: list[str] = Field(default_factory=list)
    genres: list[str] = Field(default_factory=list)
    bpm_range: list[int] = Field(default_factory=lambda: [80, 120])
    key: str = "auto"
    duration_preference: str = "medium"
    default_curve: str = "neutral"
    waypoint_template: list[dict] = Field(default_factory=list)
    instrumental_default: bool = True
    tenant_id: str = "default"
    sort_order: int = 0
    enabled: bool = True


@router.get("/tenants")
def list_tenant_stats(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    from sqlalchemy import func

    user_rows = (
        db.query(User.tenant_id, func.count(User.id))
        .group_by(User.tenant_id)
        .all()
    )
    work_rows = (
        db.query(Work.tenant_id, func.count(Work.id))
        .group_by(Work.tenant_id)
        .all()
    )
    post_rows = (
        db.query(Post.tenant_id, func.count(Post.id))
        .group_by(Post.tenant_id)
        .all()
    )
    tenants: dict[str, dict[str, int]] = {}
    for tid, count in user_rows:
        key = tid or "default"
        tenants.setdefault(key, {"users": 0, "works": 0, "posts": 0})
        tenants[key]["users"] = count
    for tid, count in work_rows:
        key = tid or "default"
        tenants.setdefault(key, {"users": 0, "works": 0, "posts": 0})
        tenants[key]["works"] = count
    for tid, count in post_rows:
        key = tid or "default"
        tenants.setdefault(key, {"users": 0, "works": 0, "posts": 0})
        tenants[key]["posts"] = count
    return [{"tenant_id": k, **v} for k, v in sorted(tenants.items())]


@router.post("/tenants/create")
def create_tenant(
    payload: TenantCreateRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    from app.models.schemas import Tenant
    from app.services.tenant import get_or_create_tenant

    if db.query(Tenant).filter(Tenant.id == payload.tenant_id).first():
        raise HTTPException(status_code=400, detail="Tenant already exists")
    tenant = Tenant(
        id=payload.tenant_id,
        name=payload.name.strip(),
        plan=payload.plan,
        invite_code=payload.invite_code.strip() if payload.invite_code else None,
        credit_pool=payload.initial_credits,
    )
    db.add(tenant)
    db.commit()
    return {
        "tenant_id": tenant.id,
        "name": tenant.name,
        "plan": tenant.plan,
        "credit_pool": tenant.credit_pool,
        "invite_code": tenant.invite_code,
    }


@router.post("/tenants/{tenant_id}/credits")
def grant_tenant_pool(
    tenant_id: str,
    payload: TenantPoolGrantRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    from app.services.tenant import get_or_create_tenant

    tenant = get_or_create_tenant(db, tenant_id)
    tenant.credit_pool += payload.amount
    db.commit()
    return {"tenant_id": tenant.id, "credit_pool": tenant.credit_pool, "granted": payload.amount}


@router.put("/users/{user_id}/tenant-admin")
def set_tenant_admin(
    user_id: str,
    enabled: bool = True,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    target = db.query(User).filter(User.id == uuid.UUID(user_id)).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    target.is_tenant_admin = enabled
    db.commit()
    return {"user_id": str(target.id), "username": target.username, "is_tenant_admin": target.is_tenant_admin}


@router.put("/users/{user_id}/tenant")
def assign_user_tenant(
    user_id: str,
    payload: TenantAssignRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    target = db.query(User).filter(User.id == uuid.UUID(user_id)).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    target.tenant_id = payload.tenant_id.strip()
    db.commit()
    return {"user_id": str(target.id), "username": target.username, "tenant_id": target.tenant_id}


@router.post("/credits/grant")
def grant_credits(
    payload: CreditGrantRequest,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if payload.amount <= 0 or payload.amount > 100_000:
        raise HTTPException(status_code=400, detail="Invalid amount")
    target: User | None = None
    if payload.user_id:
        target = db.query(User).filter(User.id == uuid.UUID(payload.user_id)).first()
    elif payload.email:
        target = db.query(User).filter(User.email == payload.email.strip()).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    row = add_credits(db, target.id, payload.amount)
    from app.services.admin_audit import log_admin_action

    log_admin_action(
        db,
        admin_id=user.id,
        action="credits_grant",
        target=str(target.id),
        detail={"amount": payload.amount, "email": target.email},
    )
    return {
        "user_id": str(target.id),
        "username": target.username,
        "email": target.email,
        "balance": row.balance,
        "granted": payload.amount,
    }


@router.get("/commercial")
def admin_commercial(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    from sqlalchemy import func

    from app.models.schemas import CreditTransaction, PaymentOrder, User
    from app.services.analytics import conversion_funnel
    from app.services.payment_orders import commercial_stats

    paid_orders = (
        db.query(PaymentOrder.pack_id, func.count(PaymentOrder.id))
        .filter(PaymentOrder.status == "paid")
        .group_by(PaymentOrder.pack_id)
        .all()
    )
    grants = (
        db.query(CreditTransaction.source, func.sum(CreditTransaction.credits))
        .filter(CreditTransaction.credits > 0)
        .group_by(CreditTransaction.source)
        .all()
    )
    spends = (
        db.query(func.sum(CreditTransaction.credits))
        .filter(CreditTransaction.credits < 0)
        .scalar()
    ) or 0
    duel_starts = (
        db.query(func.count(CreditTransaction.id))
        .filter(CreditTransaction.source == "duel_start")
        .scalar()
    ) or 0
    return {
        "billing_30d": commercial_stats(db, days=30),
        "pack_distribution": {pid: count for pid, count in paid_orders},
        "credit_grants_by_source": {src: int(total or 0) for src, total in grants},
        "total_credits_spent": abs(int(spends)),
        "duel_starts_count": int(duel_starts),
        "users": db.query(User).count(),
        "conversion_funnel_30d": conversion_funnel(db, days=30),
    }


@router.get("/stats")
def admin_stats(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    from app.services.analytics import conversion_stats
    from app.services.payment_orders import commercial_stats

    return {
        "users": db.query(User).count(),
        "works": db.query(Work).count(),
        "jobs": db.query(GenerationJob).count(),
        "posts": db.query(Post).count(),
        "challenges": db.query(Challenge).count(),
        "pending_reports": db.query(Report).filter(Report.status == "pending").count(),
        "pipeline_version": settings.pipeline_version,
        "mock_ai_enabled": settings.use_mock_ai,
        "c2pa_enabled": settings.c2pa_enabled,
        "analytics_events_30d": conversion_stats(db, days=30),
        "billing_30d": commercial_stats(db, days=30),
    }


@router.get("/queue-metrics")
def admin_queue_metrics(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    from app.services.queue_metrics import admin_queue_snapshot

    return admin_queue_snapshot(db)


@router.get("/activation-funnel")
def admin_activation_funnel(
    days: int = 30,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    from app.services.analytics import activation_funnel

    return activation_funnel(db, days=days)


@router.get("/audit-logs")
def admin_audit_logs(
    limit: int = 50,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    from app.models.schemas import AdminAuditLog

    rows = (
        db.query(AdminAuditLog)
        .order_by(AdminAuditLog.created_at.desc())
        .limit(min(limit, 200))
        .all()
    )
    return [
        {
            "id": str(r.id),
            "admin_id": str(r.admin_id),
            "action": r.action,
            "target": r.target,
            "detail": r.detail or {},
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.get("/usage")
def api_usage(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    logs = db.query(ApiUsageLog).order_by(ApiUsageLog.created_at.desc()).limit(100).all()
    return [
        {
            "provider": log.provider,
            "model": log.model,
            "endpoint": log.endpoint,
            "tokens_used": log.tokens_used,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        }
        for log in logs
    ]


@router.get("/reports")
def list_reports(
    status: str = "pending",
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    reports = db.query(Report).filter(Report.status == status).order_by(Report.created_at.desc()).limit(100).all()
    comment_ids = [r.comment_id for r in reports if r.comment_id]
    comments = (
        {c.id: c for c in db.query(Comment).filter(Comment.id.in_(comment_ids)).all()}
        if comment_ids
        else {}
    )
    return [
        {
            "id": str(r.id),
            "reason": r.reason,
            "status": r.status,
            "post_id": str(r.post_id) if r.post_id else None,
            "work_id": str(r.work_id) if r.work_id else None,
            "comment_id": str(r.comment_id) if r.comment_id else None,
            "comment_preview": (
                (comments[r.comment_id].content or "")[:120]
                if r.comment_id and r.comment_id in comments
                else None
            ),
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in reports
    ]


@router.post("/reports/{report_id}/resolve")
def resolve_report(
    report_id: str,
    payload: ReportResolve,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    report = db.query(Report).filter(Report.id == uuid.UUID(report_id)).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    report.status = payload.status
    if payload.action == "hide_post" and report.post_id:
        post = db.query(Post).filter(Post.id == report.post_id).first()
        if post:
            post.visibility = "hidden"
    elif payload.action == "hide_comment" and report.comment_id:
        comment = db.query(Comment).filter(Comment.id == report.comment_id).first()
        if comment:
            comment.is_filtered = True
            comment.content = "[内容已隐藏]"
    db.commit()
    from app.services.admin_audit import log_admin_action

    log_admin_action(
        db,
        admin_id=user.id,
        action="report_resolve",
        target=report_id,
        detail={"status": payload.status, "action": payload.action},
    )
    return {"status": report.status}


@router.get("/flags")
def list_flags(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    flags = db.query(FeatureFlag).all()
    return [{"key": f.key, "enabled": f.enabled, "description": f.description, "config": f.config} for f in flags]


@router.put("/flags/{key}")
def update_flag(
    key: str,
    payload: FeatureFlagUpdate,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    flag = db.query(FeatureFlag).filter(FeatureFlag.key == key).first()
    if not flag:
        flag = FeatureFlag(key=key, enabled=payload.enabled, config=payload.config or {})
        db.add(flag)
    else:
        flag.enabled = payload.enabled
        if payload.config is not None:
            flag.config = payload.config
    db.commit()
    from app.services.admin_audit import log_admin_action

    log_admin_action(
        db,
        admin_id=user.id,
        action="flag_update",
        target=key,
        detail={"enabled": payload.enabled},
    )
    from app.services.cache import cache_clear

    cache_clear("flags:public")
    return {"key": key, "enabled": flag.enabled}


@router.post("/seed")
def seed_defaults(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Seed default challenges, feature flags, and style presets."""
    from app.core.style_presets import seed_builtin_presets

    defaults_flags = [
        ("music_cover", False, "Enable AI cover generation during post-process"),
        ("hls_streaming", True, "Enable HLS transcoding"),
        ("c2pa_provenance", settings.c2pa_enabled, "Enable C2PA manifests"),
        ("personalized_feed", True, "Enable embedding-based feed ranking"),
        ("credits_gate", settings.credits_gate_enabled, "Enable generation credits gate (402 when insufficient)"),
        ("multi_tenant", False, "Enable tenant_id isolation on feed and works"),
    ]
    for key, enabled, desc in defaults_flags:
        if not db.query(FeatureFlag).filter(FeatureFlag.key == key).first():
            db.add(FeatureFlag(key=key, enabled=enabled, description=desc))

    if not db.query(Challenge).filter(Challenge.slug == "calm-to-chaos").first():
        from datetime import datetime, timedelta

        now = datetime.utcnow()
        db.add(Challenge(
            slug="calm-to-chaos",
            title="Calm to Chaos 情绪挑战",
            description="从平静到混沌，用 6 首作品讲述你的情绪旅程",
            hashtag="CalmToChaos",
            target_curve="calm_to_energy",
            starts_at=now,
            ends_at=now + timedelta(days=14),
            prize_pool_credits=50,
            prize_winners=3,
        ))
    presets_seeded = seed_builtin_presets(db)
    from app.core.style_presets import sync_member_presets

    member_synced = sync_member_presets(db)
    db.commit()
    return {"status": "seeded", "presets_seeded": presets_seeded, "member_presets_synced": member_synced}


@router.get("/presets")
def admin_list_presets(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.query(StylePreset).order_by(StylePreset.sort_order.asc(), StylePreset.id.asc()).all()
    return [
        {
            "id": r.id,
            "label": r.label,
            "category": r.category,
            "description": r.description,
            "enabled": r.enabled,
            "sort_order": r.sort_order,
        }
        for r in rows
    ]


@router.post("/presets")
def admin_create_preset(
    payload: StylePresetUpsert,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    from app.services.cache import cache_clear

    if db.query(StylePreset).filter(StylePreset.id == payload.id).first():
        raise HTTPException(status_code=409, detail="Preset id already exists")
    row = StylePreset(**payload.model_dump())
    db.add(row)
    db.commit()
    cache_clear("presets:")
    return {"id": row.id}


@router.put("/presets/{preset_id}")
def admin_update_preset(
    preset_id: str,
    payload: StylePresetUpsert,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    from app.services.cache import cache_clear

    row = db.query(StylePreset).filter(StylePreset.id == preset_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Preset not found")
    data = payload.model_dump()
    if data["id"] != preset_id:
        raise HTTPException(status_code=400, detail="Preset id mismatch")
    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    cache_clear("presets:")
    return {"id": row.id}


@router.delete("/presets/{preset_id}")
def admin_delete_preset(
    preset_id: str,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    from app.services.cache import cache_clear

    row = db.query(StylePreset).filter(StylePreset.id == preset_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Preset not found")
    row.enabled = False
    db.commit()
    cache_clear("presets:")
    return {"id": preset_id, "enabled": False}


class ModerationWordUpsert(BaseModel):
    pattern: str = Field(min_length=1, max_length=255)
    category: str = Field(default="general", max_length=64)
    level: str = Field(default="block", pattern=r"^(block|mask)$")
    enabled: bool = True


@router.get("/moderation-words")
def admin_list_moderation_words(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    from app.models.schemas import ModerationWord

    rows = db.query(ModerationWord).order_by(ModerationWord.created_at.desc()).all()
    return [
        {
            "id": str(r.id),
            "pattern": r.pattern,
            "category": r.category,
            "level": r.level,
            "enabled": r.enabled,
        }
        for r in rows
    ]


@router.post("/moderation-words")
def admin_create_moderation_word(
    payload: ModerationWordUpsert,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    from app.models.schemas import ModerationWord
    from app.services.content_moderation import invalidate_word_cache

    row = ModerationWord(
        pattern=payload.pattern,
        category=payload.category,
        level=payload.level,
        enabled=payload.enabled,
    )
    db.add(row)
    db.commit()
    invalidate_word_cache()
    return {"id": str(row.id)}


@router.delete("/moderation-words/{word_id}")
def admin_delete_moderation_word(
    word_id: str,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    from app.models.schemas import ModerationWord
    from app.services.content_moderation import invalidate_word_cache

    row = db.query(ModerationWord).filter(ModerationWord.id == uuid.UUID(word_id)).first()
    if not row:
        raise HTTPException(status_code=404, detail="Word not found")
    row.enabled = False
    db.commit()
    invalidate_word_cache()
    return {"disabled": True}


@router.post("/challenges/{slug}/finalize")
def admin_finalize_challenge(
    slug: str,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    from app.services.challenge_awards import distribute_challenge_prizes

    c = db.query(Challenge).filter(Challenge.slug == slug).first()
    if not c:
        raise HTTPException(status_code=404, detail="Challenge not found")
    return distribute_challenge_prizes(db, c)
