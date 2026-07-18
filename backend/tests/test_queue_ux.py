"""Tests for structured job errors and queue metrics."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

import pytest

from app.services.job_errors import (
    MINIMAX_BALANCE,
    MINIMAX_RATE_LIMIT,
    NETWORK_TIMEOUT,
    QUEUE_TIMEOUT,
    classify_error_message,
    classify_exception,
)
from app.services.queue_metrics import estimate_wait_seconds, queue_name_for_job


def test_classify_minimax_rate_limit():
    msg = "MiniMax 请求过于频繁（速率限制），请稍后再试 [code=1002]"
    assert classify_error_message(msg) == MINIMAX_RATE_LIMIT


def test_classify_minimax_balance():
    msg = "MiniMax 账户余额不足，请前往 MiniMax 控制台充值 [code=1008]"
    assert classify_error_message(msg) == MINIMAX_BALANCE


def test_classify_network_timeout():
    msg = "音乐生成服务连接中断或超时（通常需 1–3 分钟）。"
    assert classify_error_message(msg) == NETWORK_TIMEOUT


def test_classify_queue_timeout():
    assert classify_error_message("任务排队超时，请重试") == QUEUE_TIMEOUT


def test_classify_exception():
    code, msg = classify_exception(RuntimeError("任务排队超时，请重试"))
    assert code == QUEUE_TIMEOUT
    assert "排队超时" in msg


def test_estimate_wait_seconds():
    assert estimate_wait_seconds(2, "celery") >= 0


def test_queue_name_for_job_defaults_celery():
    class Job:
        config = {}

    assert queue_name_for_job(Job()) == "celery"


def test_queue_name_for_job_priority():
    class Job:
        config = {"_queue": "priority"}

    assert queue_name_for_job(Job()) == "priority"


def test_rate_limit_includes_retry_after():
    from fastapi import HTTPException

    from app.services import redis_rate_limit as rl

    rl._memory_buckets.clear()
    key = f"test-{uuid.uuid4()}"
    with pytest.raises(HTTPException) as exc:
        for _ in range(3):
            rl._check_memory(key, limit=2, window_seconds=60)
    assert exc.value.status_code == 429
    detail = exc.value.detail
    assert isinstance(detail, dict)
    assert detail.get("code") == "RATE_LIMITED"
    assert detail.get("retry_after_seconds", 0) >= 1


@pytest.mark.requires_db
def test_patch_completed_job_artifacts_updates_result():
    from app.database import SessionLocal
    from app.models.schemas import GenerationJob, User, Work
    from app.services.job_progress import patch_completed_job_artifacts

    db = SessionLocal()
    try:
        user = User(
            email=f"pp-{uuid.uuid4()}@test.local",
            username=f"pp_{uuid.uuid4().hex[:8]}",
            hashed_password="x",
        )
        db.add(user)
        db.flush()
        job = GenerationJob(
            owner_id=user.id,
            job_type="single",
            status="completed",
            result={"work_id": "x", "post_process_state": "pending"},
            config={},
        )
        work = Work(
            owner_id=user.id,
            title="T",
            audio_url="http://x/a.mp3",
            cover_url="http://x/c.png",
            post_process_status={"state": "ready", "hls_done": True},
        )
        db.add(job)
        db.add(work)
        db.commit()
        patch_completed_job_artifacts(db, str(job.id), work)
        db.refresh(job)
        assert job.result.get("post_process_state") == "ready"
        assert job.result.get("cover_url") == "http://x/c.png"
    finally:
        db.close()
