"""Remix tree and derivative work queries — batch-loaded."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.models.schemas import User, Work
from app.services.storage import get_storage_service


def _work_node(work: Work, author: User | None = None) -> dict[str, Any]:
    audio_url = work.audio_url
    if work.storage_key:
        try:
            audio_url = get_storage_service().get_presigned_url(work.storage_key)
        except Exception:
            pass
    return {
        "id": str(work.id),
        "title": work.title,
        "moods": work.moods or [],
        "author": author.username if author else None,
        "parent_work_id": str(work.parent_work_id) if work.parent_work_id else None,
        "audio_url": audio_url,
        "created_at": work.created_at.isoformat() if work.created_at else None,
    }


def _walk_ancestor_chain(db: Session, work: Work, max_depth: int) -> list[uuid.UUID]:
    ids: list[uuid.UUID] = []
    parent_id = work.parent_work_id
    for _ in range(max_depth):
        if not parent_id:
            break
        ids.append(parent_id)
        row = db.query(Work.parent_work_id).filter(Work.id == parent_id).first()
        parent_id = row[0] if row else None
    return ids


def _collect_descendant_ids(db: Session, root_id: uuid.UUID, max_depth: int) -> set[uuid.UUID]:
    seen: set[uuid.UUID] = set()
    frontier = {root_id}
    for _ in range(max_depth):
        if not frontier:
            break
        rows = (
            db.query(Work.id)
            .filter(Work.parent_work_id.in_(frontier))
            .all()
        )
        child_ids = {r[0] for r in rows}
        new_ids = child_ids - seen - {root_id}
        if not new_ids:
            break
        seen |= new_ids
        frontier = new_ids
    return seen


def _build_descendants_in_memory(
    root_id: uuid.UUID,
    works: dict[uuid.UUID, Work],
    authors: dict[uuid.UUID, User],
    max_depth: int,
) -> list[dict[str, Any]]:
    def children_of(parent_id: uuid.UUID) -> list[Work]:
        return sorted(
            [w for w in works.values() if w.parent_work_id == parent_id],
            key=lambda w: w.created_at or w.id,
        )

    def build_node(w: Work, depth: int) -> dict[str, Any]:
        node = _work_node(w, authors.get(w.owner_id))
        if depth > 0:
            node["children"] = [build_node(c, depth - 1) for c in children_of(w.id)]
        else:
            node["children"] = []
        return node

    return [build_node(c, max_depth - 1) for c in children_of(root_id)]


def build_remix_tree(db: Session, work_id: uuid.UUID, max_depth: int = 5) -> dict[str, Any]:
    work = db.query(Work).filter(Work.id == work_id).first()
    if not work:
        return {}

    ancestor_ids = _walk_ancestor_chain(db, work, max_depth)
    descendant_ids = _collect_descendant_ids(db, work_id, max_depth)
    all_ids = {work_id, *ancestor_ids, *descendant_ids}

    works = {w.id: w for w in db.query(Work).filter(Work.id.in_(all_ids)).all()}
    owner_ids = {w.owner_id for w in works.values()}
    authors = {u.id: u for u in db.query(User).filter(User.id.in_(owner_ids)).all()}

    root = works.get(work_id)
    if not root:
        return {}

    ancestors = [_work_node(works[aid], authors.get(works[aid].owner_id)) for aid in reversed(ancestor_ids) if aid in works]
    children = _build_descendants_in_memory(work_id, works, authors, max_depth)

    node = _work_node(root, authors.get(root.owner_id))
    node["ancestors"] = ancestors
    node["children"] = children
    return node


def list_derivatives(db: Session, work_id: uuid.UUID, limit: int = 50) -> list[dict]:
    children = (
        db.query(Work)
        .filter(Work.parent_work_id == work_id)
        .order_by(Work.created_at.desc())
        .limit(limit)
        .all()
    )
    if not children:
        return []

    owner_ids = {c.owner_id for c in children}
    authors = {u.id: u for u in db.query(User).filter(User.id.in_(owner_ids)).all()}
    return [_work_node(child, authors.get(child.owner_id)) for child in children]
