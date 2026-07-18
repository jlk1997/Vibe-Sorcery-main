"""Global search across public works and users."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_optional_user
from app.api.routes.works import work_to_response
from app.database import get_db
from app.models.schemas import Post, User, Work
from app.services.tenant import is_multi_tenant_enabled, scope_by_tenant

router = APIRouter(prefix="/search", tags=["search"])


@router.get("")
def global_search(q: str = "", db: Session = Depends(get_db), user=Depends(get_optional_user)):
    if not q.strip() or len(q.strip()) < 2:
        return {"works": [], "users": [], "posts": []}

    pattern = f"%{q.strip()}%"
    works_q = db.query(Work).filter(Work.visibility == "public", Work.title.ilike(pattern))
    if is_multi_tenant_enabled() and user:
        works_q = scope_by_tenant(works_q, Work, user, db)
    public_works = works_q.order_by(Work.created_at.desc()).limit(20).all()

    posts_q = db.query(Post).filter(Post.visibility == "public", Post.caption.ilike(pattern))
    if is_multi_tenant_enabled() and user:
        posts_q = scope_by_tenant(posts_q, Post, user, db)
    posts = posts_q.order_by(Post.created_at.desc()).limit(10).all()

    users = (
        db.query(User)
        .filter(User.username.ilike(pattern))
        .limit(10)
        .all()
    )
    return {
        "works": [work_to_response(w) for w in public_works],
        "users": [{"username": u.username, "display_name": u.display_name} for u in users],
        "posts": [
            {
                "id": str(p.id),
                "caption": p.caption,
                "work_id": str(p.work_id),
            }
            for p in posts
        ],
    }
