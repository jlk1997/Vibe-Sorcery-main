import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_optional_user, require_scope
from app.api.schemas import CommentCreate, CommentResponse, PostCreate, PostResponse, RemixRequest
from app.api.routes.works import work_to_response
from app.database import get_db
from app.models.schemas import Comment, Follow, Like, Post, Report, User, Work
from app.services.feed import build_feed
from app.services.tenant import tenant_id_for_user
from app.api.rate_limits import check_generation_rate_limit
from app.services.credits import REMIX_COST
from app.services.generation_gate import charge_generation_credits, with_credits_charged
from app.services.generation_jobs import create_generation_job, lookup_idempotent_job
from app.services.job_dispatch import dispatch_remix
from app.services.work_access import get_owned_work, get_seed_work, parse_uuid, can_remix_work

router = APIRouter(prefix="/community", tags=["community"])


class ReportCreate(BaseModel):
    reason: str = Field(min_length=3, max_length=1000)
    post_id: str | None = None
    work_id: str | None = None
    comment_id: str | None = None

    @model_validator(mode="after")
    def require_target(self):
        if not self.post_id and not self.work_id and not self.comment_id:
            raise ValueError("post_id, work_id or comment_id is required")
        return self


@router.post("/posts", response_model=PostResponse)
def create_post(
    payload: PostCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    work = get_owned_work(db, payload.work_id, user)

    existing = db.query(Post).filter(Post.work_id == work.id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Work already published")

    if payload.visibility not in ("public", "private", "unlisted"):
        raise HTTPException(status_code=400, detail="Invalid visibility")

    if not payload.content_compliance_acknowledged:
        raise HTTPException(status_code=400, detail="Content compliance acknowledgment required")

    from app.services.content_moderation import moderate_publish_content

    moderate_publish_content(payload.caption, work_title=work.title, db=db)

    work.visibility = payload.visibility
    work.allow_remix = payload.allow_remix
    work.license = payload.license
    post = Post(
        author_id=user.id,
        work_id=work.id,
        caption=payload.caption,
        tags=payload.tags,
        visibility=payload.visibility,
        tenant_id=tenant_id_for_user(user),
        consent_at=datetime.utcnow(),
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    from app.services.cache import cache_clear

    cache_clear("feed:")
    cache_clear("rising_creators:")
    from app.services.user_engagement import complete_task

    task_result = complete_task(db, user.id, "first_publish")
    from app.services.user_engagement import complete_weekly_task

    weekly_result = complete_weekly_task(db, user.id, "weekly_publish_1")
    from app.services.analytics import track_event
    from app.services.credits import get_or_create_credits

    track_event(db, "work_published", user_id=user.id, payload={"work_id": str(work.id)})
    track_event(db, "activation_first_publish", user_id=user.id, payload={"work_id": str(work.id)})
    credits_row = get_or_create_credits(db, user.id)
    response = _post_response(post, work, user)
    response.task_reward = task_result or weekly_result
    response.credits_balance = credits_row.balance
    return response


@router.delete("/posts/{post_id}")
def unpublish_post(
    post_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    post = db.query(Post).filter(Post.id == parse_uuid(post_id, field="post_id")).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if post.author_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    work = db.query(Work).filter(Work.id == post.work_id).first()
    if work:
        work.visibility = "private"
    db.delete(post)
    db.commit()
    from app.services.cache import cache_clear

    cache_clear("feed:")
    cache_clear("rising_creators:")
    return {"unpublished": True}


@router.get("/feed", response_model=list[PostResponse])
def get_feed(
    sort: str = "personalized",
    tag: str | None = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    return build_feed(db, user=user, sort=sort, tag=tag, limit=min(max(limit, 1), 50))


@router.get("/activity-stream")
def get_activity_stream(
    scope: str = "global",
    limit: int = 30,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    from app.services.social_activity import get_activity_stream as build_stream

    if scope == "following" and not user:
        return {"events": []}
    return {
        "events": build_stream(
            db,
            user.id if user else None,
            scope=scope if scope in ("global", "following") else "global",
            limit=min(max(limit, 1), 50),
        )
    }


@router.get("/rising-creators")
def get_rising_creators(limit: int = 5, db: Session = Depends(get_db)):
    from app.services.rising_creators import rising_creators

    return rising_creators(db, limit=min(max(limit, 1), 10))


@router.post("/posts/{post_id}/like")
def like_post(
    post_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    post = db.query(Post).filter(Post.id == parse_uuid(post_id, field="post_id")).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if post.visibility != "public":
        raise HTTPException(status_code=403, detail="Post not available")

    existing = db.query(Like).filter(
        Like.user_id == user.id, Like.post_id == post.id
    ).first()
    if existing:
        db.delete(existing)
        post.like_count = max(0, post.like_count - 1)
    else:
        db.add(Like(user_id=user.id, post_id=post.id))
        post.like_count += 1
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        post = db.query(Post).filter(Post.id == post.id).first()
        return {"like_count": post.like_count if post else 0, "liked": False}

    if not existing:
        work = db.query(Work).filter(Work.id == post.work_id).first()
        if work:
            from app.services.notifications import notify_post_liked

            notify_post_liked(
                db,
                author_id=post.author_id,
                liker_id=user.id,
                liker_username=user.username,
                post_id=str(post.id),
                work_id=str(work.id),
                work_title=work.title,
            )

    from app.services.cache import cache_clear

    cache_clear("feed:")

    return {"like_count": post.like_count if post else 0, "liked": not existing}


@router.post("/posts/{post_id}/comments", response_model=CommentResponse)
def add_comment(
    post_id: str,
    payload: CommentCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    post = db.query(Post).filter(Post.id == parse_uuid(post_id, field="post_id")).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if post.visibility != "public":
        raise HTTPException(status_code=403, detail="Post not available")

    from app.services.content_moderation import moderate_text, parse_mentions

    result = moderate_text(payload.content, db=db, scene="comment")
    if result.action == "block":
        raise HTTPException(status_code=400, detail=result.reason or "评论内容不合规")

    parent_id = None
    if payload.parent_id:
        parent = db.query(Comment).filter(
            Comment.id == parse_uuid(payload.parent_id, field="parent_id"),
            Comment.post_id == post.id,
        ).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent comment not found")
        parent_id = parent.id

    comment = Comment(
        user_id=user.id,
        post_id=post.id,
        parent_id=parent_id,
        content=result.text,
        is_filtered=result.is_filtered,
    )
    db.add(comment)
    post.comment_count += 1
    db.commit()
    db.refresh(comment)

    work = db.query(Work).filter(Work.id == post.work_id).first()
    if work:
        from app.services.notifications import notify_post_commented

        notify_post_commented(
            db,
            author_id=post.author_id,
            commenter_id=user.id,
            commenter_username=user.username,
            post_id=str(post.id),
            work_id=str(work.id),
            work_title=work.title,
            preview=result.text,
        )

        for username in parse_mentions(payload.content):
            mentioned = db.query(User).filter(User.username == username).first()
            if mentioned and mentioned.id != user.id:
                from app.services.notifications import notify_mention

                notify_mention(
                    db,
                    mentioned.id,
                    commenter_username=user.username,
                    post_id=str(post.id),
                    work_id=str(work.id),
                    preview=result.text,
                )

    from app.services.cache import cache_clear

    cache_clear("feed:")

    return CommentResponse(
        id=str(comment.id),
        user_id=str(user.id),
        username=user.username,
        content=comment.content,
        parent_id=str(comment.parent_id) if comment.parent_id else None,
        is_filtered=bool(comment.is_filtered),
        created_at=comment.created_at.isoformat(),
    )


@router.get("/posts/{post_id}/comments", response_model=list[CommentResponse])
def list_comments(
    post_id: str,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    post = db.query(Post).filter(Post.id == parse_uuid(post_id, field="post_id")).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if post.visibility != "public":
        raise HTTPException(status_code=403, detail="Post not available")
    comments = (
        db.query(Comment)
        .filter(Comment.post_id == parse_uuid(post_id, field="post_id"))
        .order_by(Comment.created_at.asc())
        .all()
    )
    if not comments:
        return []
    user_ids = {c.user_id for c in comments}
    users = db.query(User).filter(User.id.in_(user_ids)).all()
    by_id = {u.id: u for u in users}
    return [
        CommentResponse(
            id=str(c.id),
            user_id=str(c.user_id),
            username=by_id[c.user_id].username if c.user_id in by_id else "unknown",
            content=c.content,
            parent_id=str(c.parent_id) if c.parent_id else None,
            is_filtered=bool(c.is_filtered),
            created_at=c.created_at.isoformat(),
        )
        for c in comments
    ]


@router.delete("/posts/{post_id}/comments/{comment_id}")
def delete_comment(
    post_id: str,
    comment_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    pid = parse_uuid(post_id, field="post_id")
    cid = parse_uuid(comment_id, field="comment_id")
    comment = db.query(Comment).filter(Comment.id == cid, Comment.post_id == pid).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.user_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    post = db.query(Post).filter(Post.id == pid).first()
    db.delete(comment)
    if post:
        post.comment_count = max(0, (post.comment_count or 1) - 1)
    db.commit()
    from app.services.cache import cache_clear

    cache_clear("feed:")
    return {"deleted": True}


@router.post("/follow/{username}")
def follow_user(
    username: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target = db.query(User).filter(User.username == username).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == user.id:
        raise HTTPException(status_code=400, detail="Cannot follow yourself")

    existing = db.query(Follow).filter(
        Follow.follower_id == user.id, Follow.following_id == target.id
    ).first()
    if existing:
        db.delete(existing)
        db.commit()
        return {"following": False}
    db.add(Follow(follower_id=user.id, following_id=target.id))
    db.commit()
    from app.services.notifications import notify_new_follower

    notify_new_follower(db, target.id, user.username)
    return {"following": True}


@router.post("/report")
def report_content(
    payload: ReportCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    post_id = parse_uuid(payload.post_id, field="post_id") if payload.post_id else None
    work_id = parse_uuid(payload.work_id, field="work_id") if payload.work_id else None
    comment_id = parse_uuid(payload.comment_id, field="comment_id") if payload.comment_id else None

    if post_id:
        if not db.query(Post).filter(Post.id == post_id).first():
            raise HTTPException(status_code=404, detail="Post not found")
    if work_id:
        if not db.query(Work).filter(Work.id == work_id).first():
            raise HTTPException(status_code=404, detail="Work not found")
    if comment_id:
        if not db.query(Comment).filter(Comment.id == comment_id).first():
            raise HTTPException(status_code=404, detail="Comment not found")

    report = Report(
        reporter_id=user.id,
        post_id=post_id,
        work_id=work_id,
        comment_id=comment_id,
        reason=payload.reason,
    )
    db.add(report)
    db.commit()
    return {"status": "submitted"}


@router.post("/remix/{work_id}")
def remix_work(
    work_id: str,
    payload: RemixRequest,
    user: User = Depends(require_scope("generate")),
    db: Session = Depends(get_db),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
):
    existing = lookup_idempotent_job(db, user, idempotency_key)
    if existing:
        from app.services.credits import credits_snapshot

        return {"job_id": str(existing.id), **credits_snapshot(db, user.id)}

    check_generation_rate_limit(user)
    source = get_seed_work(db, work_id, user)
    if not can_remix_work(source):
        raise HTTPException(status_code=403, detail="原作者未开放二次创作")

    charged = charge_generation_credits(db, user.id, cost=REMIX_COST, source="remix", defer_commit=True)

    title = (payload.title or "").strip() or f"Remix of {source.title}"

    job = create_generation_job(
        db,
        user,
        job_type="remix",
        config=with_credits_charged(
            {
                "seed_work_id": str(source.id),
                "instrumental": True,
                "title": title[:60],
                "remix_intent": payload.remix_intent,
            },
            charged,
        ),
        idempotency_key=idempotency_key,
    )
    from app.services.user_engagement import complete_task
    from app.services.credits import credits_snapshot

    task_result = complete_task(db, user.id, "first_remix")
    from app.services.user_engagement import complete_weekly_task

    weekly_result = complete_weekly_task(db, user.id, "weekly_remix_1")
    from app.services.ecosystem import grant_remix_royalty

    grant_remix_royalty(db, source.owner_id, charged)
    dispatch_remix(db, user.id, str(job.id), job.config)
    db.refresh(job)
    return {"job_id": str(job.id), **credits_snapshot(db, user.id, task_result=task_result or weekly_result)}


@router.get("/charts/{chart_type}/history")
def get_community_chart_history(
    chart_type: str,
    period_key: str | None = None,
    limit: int = 20,
    db: Session = Depends(get_db),
):
    from app.services.leaderboards import get_chart_history

    return get_chart_history(db, chart_type, period_key=period_key, limit=min(max(limit, 1), 50))


@router.get("/charts/{chart_type}")
def get_community_chart(
    chart_type: str,
    period: str = "week",
    limit: int = 20,
    db: Session = Depends(get_db),
):
    from app.services.leaderboards import get_chart

    return get_chart(db, chart_type, limit=min(max(limit, 1), 50), period=period)


@router.get("/duels")
def list_community_duels(
    status: str | None = None,
    limit: int = 20,
    db: Session = Depends(get_db),
):
    from app.services.duels import list_duels

    return {"duels": list_duels(db, status=status, limit=min(max(limit, 1), 50))}


@router.get("/duels/{duel_id}")
def get_community_duel(duel_id: str, db: Session = Depends(get_db)):
    from app.services.duels import get_duel

    return get_duel(db, duel_id)


class DuelCreateRequest(BaseModel):
    work_id: str
    opponent_username: str | None = None
    theme: str = "emotion"


class DuelAcceptRequest(BaseModel):
    work_id: str


class DuelVoteRequest(BaseModel):
    side: str = Field(pattern=r"^[ab]$")
    listen_ratio: float = Field(ge=0, le=1)
    emotion_tag: str | None = None


@router.post("/duels")
def create_community_duel(
    payload: DuelCreateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.services.duels import create_duel

    return create_duel(
        db,
        user,
        work_id=payload.work_id,
        opponent_username=payload.opponent_username,
        theme=payload.theme,
    )


@router.post("/duels/{duel_id}/accept")
def accept_community_duel(
    duel_id: str,
    payload: DuelAcceptRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.services.duels import accept_duel

    return accept_duel(db, user, duel_id, work_id=payload.work_id)


@router.post("/duels/{duel_id}/vote")
def vote_community_duel(
    duel_id: str,
    payload: DuelVoteRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.services.duels import cast_duel_vote

    return cast_duel_vote(
        db,
        user,
        duel_id,
        side=payload.side,
        listen_ratio=payload.listen_ratio,
        emotion_tag=payload.emotion_tag,
    )


def _post_response(post: Post, work: Work, author: User) -> PostResponse:
    return PostResponse(
        id=str(post.id),
        work_id=str(work.id),
        author_id=str(author.id),
        author_username=author.username,
        caption=post.caption,
        tags=post.tags or [],
        like_count=post.like_count,
        comment_count=post.comment_count,
        work=work_to_response(work),
        created_at=post.created_at.isoformat(),
    )
