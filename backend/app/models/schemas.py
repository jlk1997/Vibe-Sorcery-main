import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.database import Base

try:
    from pgvector.sqlalchemy import Vector
except ImportError:
    Vector = None


def uuid_pk():
    return Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


class User(Base):
    __tablename__ = "users"

    id = uuid_pk()
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    display_name = Column(String(255), nullable=True)
    bio = Column(Text, nullable=True)
    avatar_url = Column(String(512), nullable=True)
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False)
    is_tenant_admin = Column(Boolean, default=False)
    tenant_id = Column(String(64), default="default", index=True)
    referral_code = Column(String(12), unique=True, nullable=True, index=True)
    referred_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)
    terms_accepted_at = Column(DateTime, nullable=True)
    terms_version = Column(String(32), nullable=True)
    privacy_accepted_at = Column(DateTime, nullable=True)
    privacy_version = Column(String(32), nullable=True)
    ai_notice_accepted_at = Column(DateTime, nullable=True)
    wechat_privacy_authorized_at = Column(DateTime, nullable=True)
    analytics_consent = Column(Boolean, default=False)
    deleted_at = Column(DateTime, nullable=True)
    deletion_scheduled_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    works = relationship("Work", back_populates="owner")
    posts = relationship("Post", back_populates="author")


class UserConsentLog(Base):
    __tablename__ = "user_consent_logs"

    id = uuid_pk()
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)
    consent_type = Column(String(64), nullable=False, index=True)
    version = Column(String(32), nullable=False)
    ip_address = Column(String(64), nullable=True)
    user_agent = Column(String(512), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class UserPreference(Base):
    __tablename__ = "user_preferences"

    id = uuid_pk()
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True)
    mood_tags = Column(JSONB, default=list)
    genre_tags = Column(JSONB, default=list)
    settings = Column(JSONB, default=dict)


class Work(Base):
    __tablename__ = "works"

    id = uuid_pk()
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    audio_url = Column(String(512), nullable=False)
    storage_key = Column(String(512), nullable=True)
    cover_url = Column(String(512), nullable=True)
    cover_storage_key = Column(String(512), nullable=True)
    hls_url = Column(String(512), nullable=True)
    hls_storage_prefix = Column(String(512), nullable=True)
    duration = Column(Float, nullable=True)
    visibility = Column(String(20), default="private")
    tenant_id = Column(String(64), default="default", index=True)
    moods = Column(JSONB, default=list)
    genres = Column(JSONB, default=list)
    arousal = Column(Float, nullable=True)
    valence = Column(Float, nullable=True)
    content_hash = Column(String(64), nullable=True)
    parent_work_id = Column(UUID(as_uuid=True), ForeignKey("works.id"), nullable=True)
    playlist_id = Column(UUID(as_uuid=True), ForeignKey("playlists.id"), nullable=True)
    step_index = Column(Integer, nullable=True)
    preset_id = Column(String(64), nullable=True)
    reference_work_id = Column(UUID(as_uuid=True), ForeignKey("works.id"), nullable=True)
    allow_remix = Column(Boolean, default=True)
    license = Column(String(64), default="allow_remix")
    post_process_status = Column(JSONB, default=dict)
    version = Column(Integer, default=1, nullable=False)
    is_ai_generated = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User", back_populates="works")
    parent = relationship("Work", remote_side=[id], foreign_keys=[parent_work_id])
    provenance = relationship(
        "ProvenanceRecord",
        back_populates="work",
        uselist=False,
        foreign_keys="ProvenanceRecord.work_id",
    )


class Playlist(Base):
    __tablename__ = "playlists"

    id = uuid_pk()
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    title = Column(String(255), nullable=False)
    journey_config = Column(JSONB, default=dict)
    visibility = Column(String(20), default="private")
    created_at = Column(DateTime, default=datetime.utcnow)

    tracks = relationship("PlaylistTrack", back_populates="playlist")


class PlaylistTrack(Base):
    __tablename__ = "playlist_tracks"
    __table_args__ = (Index("ix_playlist_tracks_playlist_id", "playlist_id"),)

    id = uuid_pk()
    playlist_id = Column(UUID(as_uuid=True), ForeignKey("playlists.id"), nullable=False)
    work_id = Column(UUID(as_uuid=True), ForeignKey("works.id"), nullable=False)
    position = Column(Integer, nullable=False)

    playlist = relationship("Playlist", back_populates="tracks")


class GenerationJob(Base):
    __tablename__ = "generation_jobs"

    id = uuid_pk()
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    tenant_id = Column(String(64), nullable=True, index=True)
    job_type = Column(String(50), nullable=False)
    status = Column(String(30), default="pending")
    progress = Column(Float, default=0.0)
    current_step = Column(Integer, default=0)
    total_steps = Column(Integer, default=1)
    config = Column(JSONB, default=dict)
    result = Column(JSONB, nullable=True)
    error_message = Column(Text, nullable=True)
    error_code = Column(String(64), nullable=True, index=True)
    status_message = Column(Text, nullable=True)
    phase = Column(String(32), nullable=True)
    playlist_id = Column(UUID(as_uuid=True), ForeignKey("playlists.id"), nullable=True)
    version = Column(Integer, default=1, nullable=False)
    idempotency_key = Column(String(128), nullable=True, index=True)
    post_process_pending = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class GenerationIdempotencyKey(Base):
    __tablename__ = "generation_idempotency_keys"
    __table_args__ = (
        UniqueConstraint("user_id", "key", name="uq_generation_idempotency_user_key"),
        Index("ix_generation_idempotency_created_at", "created_at"),
    )

    id = uuid_pk()
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    key = Column(String(128), nullable=False)
    job_id = Column(UUID(as_uuid=True), ForeignKey("generation_jobs.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class ProvenanceRecord(Base):
    __tablename__ = "provenance_records"

    id = uuid_pk()
    work_id = Column(UUID(as_uuid=True), ForeignKey("works.id"), unique=True, nullable=False)
    parent_work_id = Column(UUID(as_uuid=True), ForeignKey("works.id"), nullable=True)
    pipeline_version = Column(String(50), nullable=False)
    step_index = Column(Integer, default=0)
    record_type = Column(String(30), default="generated")
    emotion_snapshot = Column(JSONB, default=dict)
    m3_request = Column(JSONB, nullable=True)
    music_request = Column(JSONB, nullable=True)
    output_meta = Column(JSONB, default=dict)
    signature = Column(String(128), nullable=True)
    c2pa_manifest = Column(JSONB, nullable=True)
    blockchain_tx_hash = Column(String(128), nullable=True)
    job_id = Column(UUID(as_uuid=True), ForeignKey("generation_jobs.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    work = relationship("Work", back_populates="provenance", foreign_keys=[work_id])


class EmotionEmbedding(Base):
    __tablename__ = "emotion_embeddings"

    id = uuid_pk()
    work_id = Column(UUID(as_uuid=True), ForeignKey("works.id"), unique=True)
    embedding = Column(Vector(512) if Vector else JSONB)
    model_name = Column(String(100), default="discogs-effnet")


class ApiUsageLog(Base):
    __tablename__ = "api_usage_logs"

    id = uuid_pk()
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    provider = Column(String(50), nullable=False)
    model = Column(String(100), nullable=False)
    endpoint = Column(String(255), nullable=False)
    tokens_used = Column(Integer, default=0)
    cost_estimate = Column(Float, default=0.0)
    extra_data = Column(JSONB, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)


class Post(Base):
    __tablename__ = "posts"

    id = uuid_pk()
    author_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    work_id = Column(UUID(as_uuid=True), ForeignKey("works.id"), nullable=False)
    caption = Column(Text, nullable=True)
    tags = Column(JSONB, default=list)
    visibility = Column(String(20), default="public")
    tenant_id = Column(String(64), default="default", index=True)
    challenge_id = Column(UUID(as_uuid=True), ForeignKey("challenges.id"), nullable=True)
    like_count = Column(Integer, default=0)
    comment_count = Column(Integer, default=0)
    consent_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    author = relationship("User", back_populates="posts")


class Like(Base):
    __tablename__ = "likes"
    __table_args__ = (UniqueConstraint("user_id", "post_id", name="uq_like_user_post"),)

    id = uuid_pk()
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    post_id = Column(UUID(as_uuid=True), ForeignKey("posts.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Comment(Base):
    __tablename__ = "comments"

    id = uuid_pk()
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    post_id = Column(UUID(as_uuid=True), ForeignKey("posts.id"), nullable=False)
    parent_id = Column(UUID(as_uuid=True), ForeignKey("comments.id"), nullable=True)
    content = Column(Text, nullable=False)
    is_filtered = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Follow(Base):
    __tablename__ = "follows"
    __table_args__ = (UniqueConstraint("follower_id", "following_id", name="uq_follow"),)

    id = uuid_pk()
    follower_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    following_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Collection(Base):
    __tablename__ = "collections"

    id = uuid_pk()
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    work_id = Column(UUID(as_uuid=True), ForeignKey("works.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Report(Base):
    __tablename__ = "reports"

    id = uuid_pk()
    reporter_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    post_id = Column(UUID(as_uuid=True), ForeignKey("posts.id"), nullable=True)
    work_id = Column(UUID(as_uuid=True), ForeignKey("works.id"), nullable=True)
    comment_id = Column(UUID(as_uuid=True), ForeignKey("comments.id"), nullable=True)
    reason = Column(Text, nullable=False)
    status = Column(String(30), default="pending")
    created_at = Column(DateTime, default=datetime.utcnow)


class Challenge(Base):
    __tablename__ = "challenges"

    id = uuid_pk()
    tenant_id = Column(String(64), default="default", index=True)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    hashtag = Column(String(100), nullable=False)
    target_curve = Column(String(50), default="calm_to_energy")
    cover_url = Column(String(512), nullable=True)
    starts_at = Column(DateTime, nullable=True)
    ends_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    participant_count = Column(Integer, default=0)
    prize_pool_credits = Column(Integer, default=0)
    prize_winners = Column(Integer, default=3)
    sponsor_label = Column(String(128), nullable=True)
    awards_distributed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class ChallengeEntry(Base):
    __tablename__ = "challenge_entries"
    __table_args__ = (UniqueConstraint("challenge_id", "work_id", name="uq_challenge_work"),)

    id = uuid_pk()
    challenge_id = Column(UUID(as_uuid=True), ForeignKey("challenges.id"), nullable=False)
    work_id = Column(UUID(as_uuid=True), ForeignKey("works.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class FeatureFlag(Base):
    __tablename__ = "feature_flags"

    id = uuid_pk()
    key = Column(String(100), unique=True, nullable=False)
    enabled = Column(Boolean, default=False)
    description = Column(Text, nullable=True)
    config = Column(JSONB, default=dict)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Notification(Base):
    __tablename__ = "notifications"

    id = uuid_pk()
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    type = Column(String(50), nullable=False)
    payload = Column(JSONB, default=dict)
    read_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class StudioSession(Base):
    __tablename__ = "studio_sessions"

    id = uuid_pk()
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String(255), default="创作对话")
    messages = Column(JSONB, default=list)
    context = Column(JSONB, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class StudioDraft(Base):
    __tablename__ = "studio_drafts"
    __table_args__ = (
        Index(
            "uq_studio_drafts_user_mode_active",
            "user_id",
            "mode",
            unique=True,
            postgresql_where=text("archived IS NOT TRUE"),
        ),
    )

    id = uuid_pk()
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String(255), default="未命名草稿")
    mode = Column(String(32), default="quickTrack")
    payload = Column(JSONB, default=dict)
    version = Column(Integer, default=1, nullable=False)
    archived = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class UserCredit(Base):
    __tablename__ = "user_credits"

    id = uuid_pk()
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False)
    balance = Column(Integer, default=0)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CreditTransaction(Base):
    __tablename__ = "credit_transactions"
    __table_args__ = (
        Index(
            "uq_credit_tx_external_id",
            "external_id",
            unique=True,
            postgresql_where=text("external_id IS NOT NULL"),
        ),
    )

    id = uuid_pk()
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    pack_id = Column(String(64), nullable=True)
    credits = Column(Integer, nullable=False)
    source = Column(String(32), default="stripe")
    stripe_session_id = Column(String(255), unique=True, nullable=True, index=True)
    external_id = Column(String(255), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class PaymentOrder(Base):
    __tablename__ = "payment_orders"
    __table_args__ = (
        Index("ix_payment_orders_status_paid_at", "status", "paid_at"),
        Index("ix_payment_orders_status_expires_at", "status", "expires_at"),
        Index("ix_payment_orders_user_created", "user_id", "created_at"),
    )

    id = uuid_pk()
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    pack_id = Column(String(64), nullable=False)
    channel = Column(String(32), nullable=False)
    out_trade_no = Column(String(64), unique=True, nullable=False, index=True)
    amount_fen = Column(Integer, nullable=False)
    status = Column(String(20), default="pending")
    external_id = Column(String(128), nullable=True, index=True)
    payment_terms_version = Column(String(32), nullable=True)
    expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    paid_at = Column(DateTime, nullable=True)


class UserApiKey(Base):
    __tablename__ = "user_api_keys"

    id = uuid_pk()
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(128), nullable=False)
    key_prefix = Column(String(16), nullable=False)
    key_hash = Column(String(64), nullable=False, unique=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_used_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)
    scopes = Column(JSONB, default=lambda: ["read", "generate"])


class UserWebhook(Base):
    __tablename__ = "user_webhooks"

    id = uuid_pk()
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(128), nullable=False)
    url = Column(String(512), nullable=False)
    secret = Column(String(64), nullable=True)
    events = Column(JSONB, default=list)
    enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_delivery_at = Column(DateTime, nullable=True)
    last_error = Column(Text, nullable=True)


class PlaylistFeedback(Base):
    __tablename__ = "playlist_feedback"
    __table_args__ = (UniqueConstraint("playlist_id", "user_id", name="uq_playlist_feedback_user"),)

    id = uuid_pk()
    playlist_id = Column(UUID(as_uuid=True), ForeignKey("playlists.id"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    mood_before = Column(Float, nullable=False)
    mood_after = Column(Float, nullable=False)
    felt_shift = Column(Boolean, default=True)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class PlaylistSubscription(Base):
    __tablename__ = "playlist_subscriptions"
    __table_args__ = (UniqueConstraint("user_id", "playlist_id", name="uq_playlist_subscription_user"),)

    id = uuid_pk()
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    playlist_id = Column(UUID(as_uuid=True), ForeignKey("playlists.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class AnalyticsEvent(Base):
    __tablename__ = "analytics_events"

    id = uuid_pk()
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)
    event = Column(String(64), nullable=False, index=True)
    payload = Column(JSONB, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)


class AdminAuditLog(Base):
    __tablename__ = "admin_audit_logs"

    id = uuid_pk()
    admin_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    action = Column(String(64), nullable=False, index=True)
    target = Column(String(255), nullable=True)
    detail = Column(JSONB, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)


class Tenant(Base):
    __tablename__ = "tenants"

    id = Column(String(64), primary_key=True)
    name = Column(String(255), nullable=False)
    plan = Column(String(32), default="free")
    credit_pool = Column(Integer, default=0)
    stripe_customer_id = Column(String(255), nullable=True)
    embed_config = Column(JSONB, default=dict)
    invite_code = Column(String(32), unique=True, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class UserSubscription(Base):
    __tablename__ = "user_subscriptions"

    id = uuid_pk()
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False)
    tier = Column(String(32), default="free")
    plan_id = Column(String(64), nullable=True)
    channel = Column(String(32), nullable=True)
    stripe_subscription_id = Column(String(255), nullable=True, unique=True)
    stripe_customer_id = Column(String(255), nullable=True)
    monthly_credits = Column(Integer, default=0)
    status = Column(String(32), default="inactive")
    cancel_at_period_end = Column(Boolean, default=False)
    renews_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class WeChatUser(Base):
    __tablename__ = "wechat_users"

    id = uuid_pk()
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False)
    openid = Column(String(128), unique=True, nullable=False, index=True)
    unionid = Column(String(128), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class UserDailyCheckin(Base):
    __tablename__ = "user_daily_checkins"
    __table_args__ = (UniqueConstraint("user_id", "checkin_date", name="uq_user_checkin_date"),)

    id = uuid_pk()
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    checkin_date = Column(Date, nullable=False)
    credits_granted = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class UserTaskProgress(Base):
    __tablename__ = "user_task_progress"
    __table_args__ = (UniqueConstraint("user_id", "task_key", name="uq_user_task"),)

    id = uuid_pk()
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    task_key = Column(String(64), nullable=False)
    credits_granted = Column(Integer, default=0)
    completed_at = Column(DateTime, default=datetime.utcnow)


class StylePreset(Base):
    __tablename__ = "style_presets"

    id = Column(String(64), primary_key=True)
    label = Column(String(255), nullable=False)
    category = Column(String(64), default="scene", index=True)
    description = Column(Text, nullable=True)
    example_intent = Column(Text, nullable=True)
    moods = Column(JSONB, default=list)
    genres = Column(JSONB, default=list)
    bpm_range = Column(JSONB, default=lambda: [80, 120])
    key = Column(String(32), default="auto")
    duration_preference = Column(String(32), default="medium")
    default_curve = Column(String(64), default="neutral")
    waypoint_template = Column(JSONB, default=list)
    instrumental_default = Column(Boolean, default=True)
    tenant_id = Column(String(64), default="default", index=True)
    sort_order = Column(Integer, default=0)
    enabled = Column(Boolean, default=True)
    member_only = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CreatorTip(Base):
    __tablename__ = "creator_tips"

    id = uuid_pk()
    from_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    to_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    work_id = Column(UUID(as_uuid=True), ForeignKey("works.id"), nullable=True)
    credits = Column(Integer, nullable=False)
    platform_fee = Column(Integer, default=0)
    public_message = Column(Text, nullable=True)
    is_public = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class WorkExport(Base):
    __tablename__ = "work_exports"

    id = uuid_pk()
    work_id = Column(UUID(as_uuid=True), ForeignKey("works.id"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    export_type = Column(String(32), nullable=False)
    status = Column(String(20), default="ready")
    license_id = Column(String(64), nullable=True)
    meta = Column(JSONB, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)


class RecipeTemplate(Base):
    __tablename__ = "recipe_templates"

    id = uuid_pk()
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    spec = Column(JSONB, default=dict)
    price_credits = Column(Integer, default=0)
    purchase_count = Column(Integer, default=0)
    is_public = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class RecipeTemplatePurchase(Base):
    __tablename__ = "recipe_template_purchases"
    __table_args__ = (UniqueConstraint("template_id", "buyer_id", name="uq_template_buyer"),)

    id = uuid_pk()
    template_id = Column(UUID(as_uuid=True), ForeignKey("recipe_templates.id"), nullable=False)
    buyer_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    credits_paid = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class PaidWorkPack(Base):
    __tablename__ = "paid_work_packs"

    id = uuid_pk()
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    work_ids = Column(JSONB, default=list)
    price_credits = Column(Integer, nullable=False)
    purchase_count = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class CreatorWallet(Base):
    __tablename__ = "creator_wallets"

    id = uuid_pk()
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False)
    balance_credits = Column(Integer, default=0)
    lifetime_earned = Column(Integer, default=0)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class InvoiceRequest(Base):
    __tablename__ = "invoice_requests"

    id = uuid_pk()
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    order_id = Column(String(64), nullable=False)
    title = Column(String(255), nullable=False)
    tax_id = Column(String(64), nullable=True)
    email = Column(String(255), nullable=False)
    status = Column(String(20), default="pending")
    created_at = Column(DateTime, default=datetime.utcnow)


class EmotionJournalEntry(Base):
    __tablename__ = "emotion_journal_entries"

    id = uuid_pk()
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    entry_date = Column(Date, nullable=False)
    arousal = Column(Float, nullable=True)
    valence = Column(Float, nullable=True)
    work_id = Column(UUID(as_uuid=True), ForeignKey("works.id"), nullable=True)
    mood_tags = Column(JSONB, default=list)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class SupportTicket(Base):
    __tablename__ = "support_tickets"

    id = uuid_pk()
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    category = Column(String(32), default="refund")
    order_id = Column(String(64), nullable=True)
    subject = Column(String(255), nullable=False)
    body = Column(Text, nullable=False)
    status = Column(String(20), default="open")
    admin_note = Column(Text, nullable=True)
    resolution = Column(String(32), nullable=True)
    credits_granted = Column(Integer, default=0)
    stripe_refund_id = Column(String(128), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)


class CnRecurringWaitlist(Base):
    __tablename__ = "cn_recurring_waitlist"

    id = uuid_pk()
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    channel = Column(String(32), default="wechat")
    created_at = Column(DateTime, default=datetime.utcnow)


class ModerationWord(Base):
    __tablename__ = "moderation_words"

    id = uuid_pk()
    pattern = Column(String(255), nullable=False)
    category = Column(String(64), default="general")
    level = Column(String(16), default="block")
    enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ListenCheckin(Base):
    __tablename__ = "listen_checkins"

    id = uuid_pk()
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    work_id = Column(UUID(as_uuid=True), ForeignKey("works.id"), nullable=False, index=True)
    entry_date = Column(Date, nullable=False)
    listen_ratio = Column(Float, default=0.0)
    arousal = Column(Float, nullable=True)
    valence = Column(Float, nullable=True)
    mood_tags = Column(JSONB, default=list)
    resonance_score = Column(Float, default=0.0)
    credits_granted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class WorkEngagementStats(Base):
    __tablename__ = "work_engagement_stats"

    work_id = Column(UUID(as_uuid=True), ForeignKey("works.id"), primary_key=True)
    listen_completes = Column(Integer, default=0)
    resonance_total = Column(Float, default=0.0)
    resonance_count = Column(Integer, default=0)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class LeaderboardSnapshot(Base):
    __tablename__ = "leaderboard_snapshots"

    id = uuid_pk()
    chart_type = Column(String(32), nullable=False, index=True)
    period_key = Column(String(32), nullable=False, index=True)
    payload = Column(JSONB, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)


class Duel(Base):
    __tablename__ = "duels"

    id = uuid_pk()
    challenger_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    challenger_work_id = Column(UUID(as_uuid=True), ForeignKey("works.id"), nullable=False)
    opponent_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    opponent_work_id = Column(UUID(as_uuid=True), ForeignKey("works.id"), nullable=True)
    theme = Column(String(64), default="emotion")
    status = Column(String(24), default="pending")
    vote_ends_at = Column(DateTime, nullable=True)
    winner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    challenger_votes = Column(Integer, default=0)
    opponent_votes = Column(Integer, default=0)
    challenger_resonance = Column(Float, default=0.0)
    opponent_resonance = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)
    settled_at = Column(DateTime, nullable=True)


class DuelVote(Base):
    __tablename__ = "duel_votes"
    __table_args__ = (UniqueConstraint("duel_id", "user_id", name="uq_duel_vote_user"),)

    id = uuid_pk()
    duel_id = Column(UUID(as_uuid=True), ForeignKey("duels.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    side = Column(String(8), nullable=False)
    listen_ratio = Column(Float, default=0.0)
    emotion_tag = Column(String(64), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class UserDuelQuota(Base):
    __tablename__ = "user_duel_quotas"
    __table_args__ = (UniqueConstraint("user_id", "quota_date", name="uq_user_duel_quota_date"),)

    id = uuid_pk()
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    quota_date = Column(Date, nullable=False)
    free_starts_used = Column(Integer, default=0)
    pass_starts_remaining = Column(Integer, default=0)
