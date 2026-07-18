import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.routes.works import work_to_response
from app.database import get_db
from app.models.schemas import Collection, User, Work
from app.services.work_access import can_view_work, parse_uuid

router = APIRouter(prefix="/collections", tags=["collections"])


@router.get("")
def list_collections(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    items = db.query(Collection).filter(Collection.user_id == user.id).order_by(Collection.created_at.desc()).all()
    results = []
    for item in items:
        work = db.query(Work).filter(Work.id == item.work_id).first()
        if work and can_view_work(work, user):
            results.append({"id": str(item.id), "work": work_to_response(work), "created_at": item.created_at.isoformat()})
    return results


@router.post("/{work_id}")
def add_collection(
    work_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    work = db.query(Work).filter(Work.id == parse_uuid(work_id, field="work_id")).first()
    if not work:
        raise HTTPException(status_code=404, detail="Work not found")
    if not can_view_work(work, user):
        raise HTTPException(status_code=403, detail="Cannot collect this work")

    existing = db.query(Collection).filter(
        Collection.user_id == user.id, Collection.work_id == work.id
    ).first()
    if existing:
        return {"collected": True}
    db.add(Collection(user_id=user.id, work_id=work.id))
    db.commit()
    return {"collected": True}


@router.delete("/{work_id}")
def remove_collection(
    work_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = db.query(Collection).filter(
        Collection.user_id == user.id,
        Collection.work_id == parse_uuid(work_id, field="work_id"),
    ).first()
    if item:
        db.delete(item)
        db.commit()
    return {"collected": False}
