"""In-app notifications."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.schemas import Notification


def create_notification(
    db: Session,
    user_id: uuid.UUID,
    ntype: str,
    payload: dict,
) -> Notification:
    n = Notification(user_id=user_id, type=ntype, payload=payload)
    db.add(n)
    db.commit()
    db.refresh(n)
    return n


def notify_remix_done(
    db: Session,
    source_owner_id: uuid.UUID,
    remixer_id: uuid.UUID,
    source_work_id: str,
    new_work_id: str,
    remixer_username: str,
):
    if source_owner_id == remixer_id:
        return
    create_notification(
        db,
        source_owner_id,
        "remix_done",
        {
            "source_work_id": source_work_id,
            "new_work_id": new_work_id,
            "remixer_username": remixer_username,
            "message": f"@{remixer_username} 二次创作了你的作品",
        },
    )


def notify_new_follower(
    db: Session,
    following_id: uuid.UUID,
    follower_username: str,
):
    create_notification(
        db,
        following_id,
        "new_follower",
        {
            "follower_username": follower_username,
            "message": f"@{follower_username} 关注了你",
        },
    )


def notify_post_liked(
    db: Session,
    *,
    author_id: uuid.UUID,
    liker_id: uuid.UUID,
    liker_username: str,
    post_id: str,
    work_id: str,
    work_title: str,
):
    if author_id == liker_id:
        return
    create_notification(
        db,
        author_id,
        "post_liked",
        {
            "post_id": post_id,
            "work_id": work_id,
            "work_title": work_title,
            "liker_username": liker_username,
            "message": f"@{liker_username} 赞了你的作品「{work_title}」",
        },
    )


def notify_post_commented(
    db: Session,
    *,
    author_id: uuid.UUID,
    commenter_id: uuid.UUID,
    commenter_username: str,
    post_id: str,
    work_id: str,
    work_title: str,
    preview: str,
):
    if author_id == commenter_id:
        return
    snippet = preview[:80] + ("…" if len(preview) > 80 else "")
    create_notification(
        db,
        author_id,
        "post_commented",
        {
            "post_id": post_id,
            "work_id": work_id,
            "work_title": work_title,
            "commenter_username": commenter_username,
            "preview": snippet,
            "message": f"@{commenter_username} 评论：{snippet}",
        },
    )


def notify_job_terminal(
    db: Session,
    job,
) -> None:
    """In-app notification when a generation job finishes."""
    from app.models.schemas import GenerationJob

    if not isinstance(job, GenerationJob):
        return

    config = job.config or {}
    result = job.result or {}
    title = config.get("title") or "你的作品"

    if job.status == "completed":
        if job.job_type == "playlist":
            playlist_id = result.get("playlist_id") or (
                str(job.playlist_id) if job.playlist_id else None
            )
            create_notification(
                db,
                job.owner_id,
                "job_completed",
                {
                    "job_id": str(job.id),
                    "job_type": job.job_type,
                    "playlist_id": playlist_id,
                    "message": f"心情歌单「{title}」生成完成，可以开始转换收听了",
                },
            )
            return

        work_ids = result.get("work_ids") or []
        work_id = result.get("work_id") or (work_ids[0] if work_ids else None)
        create_notification(
            db,
            job.owner_id,
            "job_completed",
            {
                "job_id": str(job.id),
                "job_type": job.job_type,
                "work_id": work_id,
                "message": f"「{title}」生成完成",
            },
        )
        return

    if job.status in ("failed", "cancelled"):
        detail = job.error_message or ("已取消" if job.status == "cancelled" else "未知错误")
        create_notification(
            db,
            job.owner_id,
            "job_failed",
            {
                "job_id": str(job.id),
                "job_type": job.job_type,
                "message": f"生成失败：{detail}",
            },
        )


def list_notifications(db: Session, user_id: uuid.UUID, limit: int = 50) -> list[Notification]:
    return (
        db.query(Notification)
        .filter(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
        .all()
    )


def unread_count(db: Session, user_id: uuid.UUID) -> int:
    return (
        db.query(Notification)
        .filter(Notification.user_id == user_id, Notification.read_at.is_(None))
        .count()
    )


def mark_read(db: Session, user_id: uuid.UUID, notification_id: uuid.UUID) -> bool:
    n = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.user_id == user_id)
        .first()
    )
    if not n:
        return False
    n.read_at = datetime.utcnow()
    db.commit()
    return True


def mark_all_read(db: Session, user_id: uuid.UUID) -> int:
    count = (
        db.query(Notification)
        .filter(Notification.user_id == user_id, Notification.read_at.is_(None))
        .update({Notification.read_at: datetime.utcnow()})
    )
    db.commit()
    return count


def notify_mention(
    db: Session,
    mentioned_id: uuid.UUID,
    *,
    commenter_username: str,
    post_id: str,
    work_id: str,
    preview: str,
):
    snippet = preview[:60] + ("…" if len(preview) > 60 else "")
    create_notification(
        db,
        mentioned_id,
        "mention",
        {
            "post_id": post_id,
            "work_id": work_id,
            "commenter_username": commenter_username,
            "preview": snippet,
            "message": f"@{commenter_username} 在评论中提到了你",
        },
    )


def notify_duel_invite(
    db: Session,
    opponent_id: uuid.UUID,
    *,
    challenger_username: str,
    duel_id: str,
):
    create_notification(
        db,
        opponent_id,
        "duel_invite",
        {
            "duel_id": duel_id,
            "challenger_username": challenger_username,
            "message": f"@{challenger_username} 向你发起了情绪决斗",
        },
    )


def notify_duel_accepted(
    db: Session,
    challenger_id: uuid.UUID,
    *,
    opponent_username: str,
    duel_id: str,
):
    create_notification(
        db,
        challenger_id,
        "duel_accepted",
        {
            "duel_id": duel_id,
            "opponent_username": opponent_username,
            "message": f"@{opponent_username} 接受了你的决斗挑战",
        },
    )


def notify_duel_result(db: Session, duel) -> None:
    from app.models.schemas import Duel

    if not isinstance(duel, Duel):
        return
    for uid in (duel.challenger_id, duel.opponent_id):
        if not uid:
            continue
        won = duel.winner_id == uid
        draw = duel.status == "draw"
        if draw:
            msg = "情绪决斗平局，双方获得参与奖"
        elif won:
            msg = "恭喜，你在情绪决斗中获胜！"
        else:
            msg = "情绪决斗已结束，下次再接再厉"
        create_notification(
            db,
            uid,
            "duel_result",
            {
                "duel_id": str(duel.id),
                "winner_id": str(duel.winner_id) if duel.winner_id else None,
                "status": duel.status,
                "message": msg,
            },
        )


def notify_tip_received(
    db: Session,
    creator_id: uuid.UUID,
    *,
    tipper_username: str,
    work_id: str,
    work_title: str,
    credits: int,
    public_message: str | None = None,
):
    payload = {
        "work_id": work_id,
        "work_title": work_title,
        "tipper_username": tipper_username,
        "credits": credits,
        "message": f"@{tipper_username} 打赏了你的作品「{work_title}」{credits} 额度",
    }
    if public_message:
        payload["public_message"] = public_message
    create_notification(db, creator_id, "tip_received", payload)


def notify_challenge_award(
    db: Session,
    user_id: uuid.UUID,
    *,
    challenge_title: str,
    rank: int,
    credits: int,
    work_title: str,
):
    create_notification(
        db,
        user_id,
        "challenge_award",
        {
            "challenge_title": challenge_title,
            "rank": rank,
            "credits": credits,
            "work_title": work_title,
            "message": f"挑战「{challenge_title}」第 {rank} 名，获得 {credits} 额度",
        },
    )


def notify_challenge_ending(
    db: Session,
    user_id: uuid.UUID,
    *,
    challenge_slug: str,
    challenge_title: str,
    hours_left: int,
):
    create_notification(
        db,
        user_id,
        "challenge_ending",
        {
            "challenge_slug": challenge_slug,
            "challenge_title": challenge_title,
            "hours_left": hours_left,
            "message": f"挑战「{challenge_title}」将在约 {hours_left} 小时后结束，抓紧拉票吧",
        },
    )
