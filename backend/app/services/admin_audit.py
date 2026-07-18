"""Admin audit logging."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.models.schemas import AdminAuditLog


def log_admin_action(
    db: Session,
    *,
    admin_id: uuid.UUID,
    action: str,
    target: str | None = None,
    detail: dict[str, Any] | None = None,
) -> None:
    row = AdminAuditLog(
        admin_id=admin_id,
        action=action[:64],
        target=target,
        detail=detail or {},
    )
    db.add(row)
    db.commit()
