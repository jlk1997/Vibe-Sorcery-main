from pathlib import Path
from urllib.parse import urlencode

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_ROOT = Path(__file__).resolve().parents[2]
_ENV_FILE = _ROOT / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE) if _ENV_FILE.exists() else None,
        extra="ignore",
    )

    app_name: str = "Vibe Sorcery"
    app_version: str = "3.0.0"
    debug: bool = False
    api_prefix: str = "/api/v1"
    # When false, skip Alembic inside API startup (run `alembic upgrade head` in run-api.ps1 / deploy instead).
    run_alembic_on_startup: bool = True

    database_url: str = "postgresql://vibe:vibe@localhost:5432/vibe_sorcery"
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://redis:6379/1"
    celery_result_backend: str = "redis://redis:6379/2"

    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7

    minimax_api_key: str = ""
    minimax_api_base: str = "https://api.minimaxi.com/v1"
    # 音乐生成：music-2.6 — 文本+歌词生成完整歌曲/纯音乐
    minimax_music_model: str = "music-2.6"
    # 翻唱/风格迁移：music-cover — 基于参考音频（一步/两步翻唱）
    minimax_music_cover_model: str = "music-cover"
    # 文本/旅程规划/歌词润色：MiniMax-M3（见官方语言模型）
    minimax_chat_model: str = "MiniMax-M3"
    # 封面图：image-01
    minimax_image_model: str = "image-01"
    # music-2.6 默认输出；流式模式仅支持 hex
    minimax_music_output_format: str = "hex"
    minimax_music_stream: bool = True
    minimax_music_sample_rate: int = 44100
    minimax_music_bitrate: int = 256000
    minimax_music_format: str = "mp3"
    # 无人声且无歌词时，是否让 music-2.6 自动从 prompt 生成歌词
    minimax_lyrics_optimizer_default: bool = False
    # music-cover 默认模式：one_step | two_step
    minimax_cover_mode_default: str = "one_step"
    # HTTP：音乐生成耗时长，需更大 read timeout；默认不走系统代理（避免 60s 代理断连）
    minimax_music_timeout_seconds: int = 600
    minimax_chat_timeout_seconds: int = 120
    minimax_http_retries: int = 3
    minimax_http_trust_env: bool = False
    minimax_max_inflight: int = 2
    minimax_http_max_connections: int = 16
    minimax_http_max_keepalive: int = 8

    s3_endpoint: str = "http://localhost:9000"
    s3_public_endpoint: str = "http://localhost:9000"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    s3_bucket: str = "vibe-sorcery"
    s3_region: str = "us-east-1"
    s3_use_ssl: bool = False

    models_dir: str = str(_ROOT / "models")
    pipeline_version: str = "vibe-sorcery/3.0.0"
    cors_origins: str = "http://localhost:3000,http://localhost:8081"

    # CDN / OSS (Phase 3)
    cdn_base_url: str = ""
    default_tenant_id: str = "default"
    multi_tenant_enabled: bool = False
    ffmpeg_path: str = "ffmpeg"

    # 生成音乐时自动生成专辑封面（默认开启；需真实 MiniMax 图像接口）
    music_cover_enabled: bool = True

    # C2PA / 存证 (Phase 3)
    c2pa_enabled: bool = True
    blockchain_anchor_enabled: bool = False
    blockchain_rpc_url: str = ""
    blockchain_contract: str = ""

    # When true and MINIMAX_API_KEY is empty, use template prompts + echo seed audio for local dev
    dev_mock_generation: bool = False

    # Billing (Stripe)
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_webhook_tolerance_seconds: int = 300
    frontend_base_url: str = "http://localhost:3000"  # Docker H5; local dev use http://localhost:10086
    api_public_url: str = "http://localhost:8000/api/v1"

    # WeChat mini-program & pay (API v2 MD5)
    wechat_app_id: str = ""
    wechat_app_secret: str = ""
    wechat_pay_mch_id: str = ""
    wechat_pay_api_key: str = ""
    wechat_tpl_job_complete: str = ""
    wechat_tpl_low_credits: str = ""

    @field_validator(
        "wechat_app_id",
        "wechat_app_secret",
        "wechat_pay_mch_id",
        "wechat_pay_api_key",
        mode="before",
    )
    @classmethod
    def _strip_wechat_secrets(cls, v):
        if v is None:
            return ""
        return str(v).strip().strip('"').strip("'")

    # Alipay (OpenAPI RSA2)
    alipay_app_id: str = ""
    alipay_private_key: str = ""
    alipay_public_key: str = ""
    alipay_sandbox: bool = False

    # Subscription
    stripe_subscription_price_id: str = ""
    stripe_subscription_yearly_price_id: str = ""
    subscription_monthly_credits: int = 30
    payment_order_ttl_hours: int = 2

    # Only promote this email to admin when no admin exists (empty = no auto-promotion)
    admin_bootstrap_email: str = ""

    # One-time WS stream ticket lifetime (seconds)
    ws_stream_ticket_ttl_seconds: int = 120
    # Protected audio/HLS playback tickets (seconds) — limits F12 / link sharing
    media_playback_ticket_ttl_seconds: int = 600
    media_hls_segment_presign_seconds: int = 600

    # Credits economy
    credits_gate_enabled: bool = True
    welcome_credits: int = 15
    daily_checkin_credits: int = 1
    task_credits_first_publish: int = 3
    task_credits_journey_feedback: int = 2
    task_credits_first_remix: int = 1
    task_credits_first_challenge: int = 2
    referral_enabled: bool = True
    referral_credits_referrer: int = 5
    referral_credits_invitee: int = 5
    copilot_llm_stream: bool = True

    # Observability
    sentry_dsn: str = ""
    metrics_enabled: bool = True
    copilot_rate_limit_per_minute: int = 30

    # Legal / compliance (H5 footer & legal pages)
    legal_icp_number: str = ""
    legal_contact_email: str = "privacy@vibe-sorcery.com"
    legal_contact_phone: str = "400-000-0000"
    legal_company_name: str = "炼金音坊"

    # Concurrency / rate limiting
    rate_limit_fail_closed: bool = False
    celery_task_time_limit_seconds: int = 1800
    celery_task_soft_time_limit_seconds: int = 1740
    celery_worker_pool: str = Field(
        default="solo",
        validation_alias=AliasChoices("celery_worker_pool", "CELERY_WORKER_POOL", "CELERY_POOL"),
    )
    celery_worker_concurrency: int = Field(
        default=1,
        validation_alias=AliasChoices("celery_worker_concurrency", "CELERY_WORKER_CONCURRENCY", "CELERY_CONCURRENCY"),
    )
    celery_post_concurrency: int = Field(
        default=2,
        validation_alias=AliasChoices("celery_post_concurrency", "CELERY_POST_CONCURRENCY"),
    )
    variation_parallel: bool = True
    queue_max_depth: int = 200
    stale_pending_minutes: int = 15
    default_compose_eta_seconds: int = 90
    compose_stats_window: int = 50

    @property
    def cdn_url(self) -> str:
        return self.cdn_base_url.rstrip("/") if self.cdn_base_url else self.s3_public_endpoint

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def use_mock_ai(self) -> bool:
        return self.dev_mock_generation or not self.minimax_api_key

    @property
    def wechat_pay_enabled(self) -> bool:
        return bool(self.wechat_app_id and self.wechat_pay_mch_id and self.wechat_pay_api_key)

    @property
    def alipay_enabled(self) -> bool:
        return bool(self.alipay_app_id and self.alipay_private_key and self.alipay_public_key)

    @property
    def alipay_gateway(self) -> str:
        if self.alipay_sandbox:
            return "https://openapi-sandbox.dl.alipaydev.com/gateway.do"
        return "https://openapi.alipay.com/gateway.do"

    @property
    def payment_mock_allowed(self) -> bool:
        """Instant mock checkout only in dev / explicit mock mode."""
        return bool(self.debug or self.dev_mock_generation)

    def frontend_page(self, page_path: str, **query: str) -> str:
        """Absolute Taro H5 route, e.g. /pages/settings/index?checkout=success."""
        base = self.frontend_base_url.rstrip("/")
        path = page_path if page_path.startswith("/") else f"/{page_path}"
        if query:
            return f"{base}{path}?{urlencode(query)}"
        return f"{base}{path}"


settings = Settings()
