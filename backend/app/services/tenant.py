"""Multi-tenant helpers — scoping, embed branding, credit pool."""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Query, Session

from app.config import settings
from app.models.schemas import Tenant, User


def is_multi_tenant_enabled(db: Session | None = None) -> bool:
    if bool(getattr(settings, "multi_tenant_enabled", False)):
        return True
    if db is not None:
        from app.models.schemas import FeatureFlag

        row = db.query(FeatureFlag).filter(FeatureFlag.key == "multi_tenant", FeatureFlag.enabled == True).first()
        if row:
            return True
    return False


def tenant_id_for_user(user: User | None) -> str:
    if user and getattr(user, "tenant_id", None):
        return user.tenant_id
    return settings.default_tenant_id


def scope_by_tenant(query: Query, model, user: User | None = None, db: Session | None = None) -> Query:
    """Filter query to the current tenant when multi-tenant mode is on."""
    if not is_multi_tenant_enabled(db):
        return query
    return query.filter(model.tenant_id == tenant_id_for_user(user))


def get_or_create_tenant(db: Session, tenant_id: str, *, name: str | None = None) -> Tenant:
    row = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if row:
        return row
    row = Tenant(id=tenant_id, name=name or tenant_id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def resolve_tenant_by_host(db: Session, host: str) -> str | None:
    host = host.lower().split(":")[0]
    rows = db.query(Tenant).all()
    for row in rows:
        cfg = row.embed_config or {}
        domains = cfg.get("custom_domains") or []
        if host in [d.lower() for d in domains]:
            return row.id
    return None


def embed_branding_for_tenant(db: Session, tenant_id: str) -> dict:
    tenant = get_or_create_tenant(db, tenant_id)
    cfg = dict(tenant.embed_config or {})
    hide = bool(cfg.get("hide_powered_by")) and tenant.plan in ("team", "enterprise", "member")
    return {
        "tenant_id": tenant.id,
        "brand": cfg.get("brand") or "炼金音坊",
        "logo_url": cfg.get("logo_url"),
        "accent_color": cfg.get("accent_color"),
        "hide_powered_by": hide,
        "plan": tenant.plan,
    }


def is_tenant_admin_user(user: User) -> bool:
    return bool(getattr(user, "is_admin", False) or getattr(user, "is_tenant_admin", False))


def allocate_tenant_credits(db: Session, tenant_id: str, user_id, amount: int) -> dict:
    """Move credits from tenant pool to a member user."""
    import uuid

    from app.services.credits import add_credits

    if amount <= 0:
        raise ValueError("amount must be positive")
    tenant = get_or_create_tenant(db, tenant_id)
    if tenant.credit_pool < amount:
        raise HTTPException(status_code=402, detail="租户额度池不足")
    tenant.credit_pool -= amount
    row = add_credits(db, uuid.UUID(str(user_id)), amount)
    db.commit()
    return {"allocated": amount, "member_balance": row.balance, "pool_remaining": tenant.credit_pool}
