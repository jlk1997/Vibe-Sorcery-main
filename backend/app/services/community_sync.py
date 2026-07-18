"""Keep community posts aligned when work metadata changes."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.schemas import Post


def should_sync_post_caption(post: Post, old_title: str, *, force: bool | None) -> bool:
    if force is True:
        return True
    if force is False:
        return False
    caption = (post.caption or "").strip()
    if not caption:
        return True
    return caption == old_title.strip()


def sync_post_caption_for_work_rename(
    db: Session,
    work_id,
    *,
    old_title: str,
    new_title: str,
    force: bool | None = None,
) -> bool:
    post = db.query(Post).filter(Post.work_id == work_id).first()
    if not post:
        return False
    if not should_sync_post_caption(post, old_title, force=force):
        return False
    post.caption = new_title.strip()
    return True
