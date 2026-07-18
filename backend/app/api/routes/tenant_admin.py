"""Tenant-scoped admin — embed config, member credits, billing pool."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_tenant_admin
from app.database import get_db
from app.models.schemas import User
from app.services.tenant import (
    allocate_tenant_credits,
    embed_branding_for_tenant,
    get_or_create_tenant,
    is_tenant_admin_user,
    tenant_id_for_user,
)

router = APIRouter(prefix="/tenant-admin", tags=["tenant-admin"])


class EmbedConfigUpdate(BaseModel):
    brand: str | None = Field(default=None, max_length=64)
    logo_url: str | None = Field(default=None, max_length=512)
    accent_color: str | None = Field(default=None, max_length=32)
    hide_powered_by: bool | None = None
    custom_domains: list[str] | None = None


class AllocateCreditsRequest(BaseModel):
    email: str = Field(min_length=3)
    amount: int = Field(gt=0, le=10000)


@router.get("")
def get_tenant_dashboard(
    user: User = Depends(require_tenant_admin),
    db: Session = Depends(get_db),
):
    tid = tenant_id_for_user(user)
    tenant = get_or_create_tenant(db, tid)
    member_count = db.query(User).filter(User.tenant_id == tid).count()
    return {
        "tenant_id": tenant.id,
        "name": tenant.name,
        "plan": tenant.plan,
        "credit_pool": tenant.credit_pool,
        "member_count": member_count,
        "embed": embed_branding_for_tenant(db, tid),
        "is_platform_admin": bool(user.is_admin),
    }


@router.patch("/embed")
def update_embed_config(
    payload: EmbedConfigUpdate,
    user: User = Depends(require_tenant_admin),
    db: Session = Depends(get_db),
):
    tid = tenant_id_for_user(user)
    tenant = get_or_create_tenant(db, tid)
    cfg = dict(tenant.embed_config or {})
    if payload.brand is not None:
        cfg["brand"] = payload.brand.strip()
    if payload.logo_url is not None:
        cfg["logo_url"] = payload.logo_url.strip() or None
    if payload.accent_color is not None:
        cfg["accent_color"] = payload.accent_color.strip() or None
    if payload.hide_powered_by is not None:
        cfg["hide_powered_by"] = payload.hide_powered_by
    if payload.custom_domains is not None:
        cfg["custom_domains"] = [d.strip().lower() for d in payload.custom_domains if d.strip()]
    tenant.embed_config = cfg
    db.commit()
    return embed_branding_for_tenant(db, tid)


@router.get("/members")
def list_tenant_members(
    user: User = Depends(require_tenant_admin),
    db: Session = Depends(get_db),
):
    tid = tenant_id_for_user(user)
    rows = db.query(User).filter(User.tenant_id == tid).order_by(User.created_at.desc()).limit(200).all()
    return [
        {
            "id": str(u.id),
            "username": u.username,
            "email": u.email,
            "is_tenant_admin": bool(u.is_tenant_admin),
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in rows
    ]


@router.post("/credits/allocate")
def allocate_credits_to_member(
    payload: AllocateCreditsRequest,
    user: User = Depends(require_tenant_admin),
    db: Session = Depends(get_db),
):
    tid = tenant_id_for_user(user)
    member = db.query(User).filter(User.email == payload.email.strip().lower(), User.tenant_id == tid).first()
    if not member:
        raise HTTPException(status_code=404, detail="租户内未找到该邮箱用户")
    result = allocate_tenant_credits(db, tid, member.id, payload.amount)
    return {"username": member.username, **result}
