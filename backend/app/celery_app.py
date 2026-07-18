from celery import Celery
from celery.schedules import crontab

from app.config import settings

celery_app = Celery(
    "vibe_sorcery",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_reject_on_worker_lost=True,
    task_time_limit=settings.celery_task_time_limit_seconds,
    task_soft_time_limit=settings.celery_task_soft_time_limit_seconds,
    worker_pool=settings.celery_worker_pool,
    worker_concurrency=settings.celery_worker_concurrency,
    imports=("app.workers.tasks",),
    task_queues={
        "celery": {"exchange": "celery", "routing_key": "celery"},
        "priority": {"exchange": "priority", "routing_key": "priority"},
        "post_process": {"exchange": "post_process", "routing_key": "post_process"},
    },
    task_routes={
        "post_process_work_task": {"queue": "post_process"},
    },
    beat_schedule={
        "renew-mock-subscriptions-daily": {
            "task": "renew_subscriptions_task",
            "schedule": crontab(hour=0, minute=15),
        },
        "subscription-expiry-reminder-daily": {
            "task": "subscription_expiry_reminder_task",
            "schedule": crontab(hour=9, minute=0),
        },
        "reconcile-stale-pending-jobs": {
            "task": "reconcile_stale_pending_jobs_task",
            "schedule": crontab(minute="*/10"),
        },
        "pending-jobs-heartbeat": {
            "task": "pending_jobs_heartbeat_task",
            "schedule": 30.0,
        },
        "finalize-pending-deletions-daily": {
            "task": "finalize_pending_deletions_task",
            "schedule": crontab(hour=2, minute=30),
        },
        "expire-stale-payment-orders-hourly": {
            "task": "expire_stale_payment_orders_task",
            "schedule": crontab(minute=30),
        },
        "deactivate-expired-subscriptions-daily": {
            "task": "deactivate_expired_subscriptions_task",
            "schedule": crontab(hour=0, minute=45),
        },
        "finalize-ended-challenges-hourly": {
            "task": "finalize_challenges_task",
            "schedule": crontab(minute=15),
        },
        "settle-expired-duels-hourly": {
            "task": "settle_duels_task",
            "schedule": crontab(minute=45),
        },
        "snapshot-leaderboards-daily": {
            "task": "snapshot_leaderboards_task",
            "schedule": crontab(hour=1, minute=0),
        },
        "creator-weekly-digest": {
            "task": "creator_weekly_digest_task",
            "schedule": crontab(hour=10, minute=0, day_of_week=1),
        },
        "remind-ending-challenges-daily": {
            "task": "remind_ending_challenges_task",
            "schedule": crontab(hour=8, minute=0),
        },
    },
)
from celery.signals import worker_shutdown


@worker_shutdown.connect
def _close_minimax_http_on_worker_shutdown(**_kwargs):
    from app.integrations.minimax.http_utils import close_minimax_http_pool_sync

    close_minimax_http_pool_sync()
