from pydantic import BaseModel, EmailStr, Field


class UserRegister(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=100)
    password: str = Field(min_length=6)
    display_name: str | None = None
    invite_code: str | None = Field(default=None, max_length=32)
    referral_code: str | None = Field(default=None, max_length=12)
    accepted_terms_version: str = Field(min_length=1)
    accepted_privacy_version: str = Field(min_length=1)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: str
    email: str
    username: str
    display_name: str | None = None
    bio: str | None = None
    avatar_url: str | None = None
    tenant_id: str | None = None
    is_tenant_admin: bool = False
    is_admin: bool = False
    deletion_scheduled_at: str | None = None
    consent_missing: list[str] = []

    class Config:
        from_attributes = True


class PublicProfileResponse(BaseModel):
    username: str
    display_name: str | None = None
    bio: str | None = None
    avatar_url: str | None = None
    stats: dict
    is_following: bool | None = None

    class Config:
        from_attributes = True


class EmotionAnalyzeResponse(BaseModel):
    moods: list[str]
    genres: list[str]
    arousal: float | None = None
    valence: float | None = None


class Waypoint(BaseModel):
    step: int = Field(ge=0)
    arousal: float = Field(ge=1, le=9)
    valence: float = Field(ge=1, le=9)
    description: str | None = None


class JourneyConfig(BaseModel):
    mode: str = "prompt_journey"
    steps: int = Field(default=6, ge=1, le=12)
    target_curve: str = "calm_to_energy"
    instrumental: bool = True
    title: str | None = None
    waypoints: list[Waypoint] = []
    structure: str | None = None
    reference: dict | None = None


class ReferenceConfig(BaseModel):
    work_id: str
    av_offset: dict | None = None


class MusicParams(BaseModel):
    bpm_range: list[int] = Field(default=[80, 120])
    key: str = "auto"
    duration_preference: str = "medium"


class MusicCreativeSpecSchema(BaseModel):
    instruments: list[str] = []
    genres: list[str] = []
    moods: list[str] = []
    tempo_feel: str = ""
    bpm: int | None = Field(default=None, ge=40, le=220)
    bpm_range: list[int] | None = None
    key: str = "auto"
    texture: str = ""
    meter: str = ""
    era: str = ""
    text_intent: str = ""
    style_tags: str = ""
    journey_hint: str = ""
    custom_prompt_override: str = ""


class PlaylistGenerateRequest(BaseModel):
    text_intent: str | None = None
    preset_id: str | None = None
    generation_mode: str = "prompt_journey"
    seed_work_id: str | None = None
    journey: JourneyConfig = JourneyConfig()
    music_params: MusicParams = MusicParams()
    moods: list[str] = []
    genres: list[str] = []
    creative_spec: MusicCreativeSpecSchema | None = None


class ApplyPresetRequest(BaseModel):
    preset_id: str
    steps: int = Field(default=6, ge=1, le=12)
    text_intent: str | None = None
    target_curve: str | None = None
    instrumental: bool | None = None
    title: str | None = None


class SingleGenerateRequest(BaseModel):
    text_intent: str | None = None
    seed_work_id: str | None = None
    reference: dict | None = None
    instrumental: bool = True
    title: str | None = None
    lyrics: str | None = Field(default=None, max_length=3500)
    style_tags: str | None = Field(default=None, max_length=2000)
    song_title: str | None = Field(default=None, max_length=120)
    creative_spec: MusicCreativeSpecSchema | None = None
    lyrics_optimizer: bool | None = None
    bpm: int | None = Field(default=None, ge=40, le=220)
    key: str | None = None
    moods: list[str] = []
    genres: list[str] = []
    seed: int | None = Field(default=None, ge=0, le=999_999)
    preview_pick_count: int = Field(default=1, ge=0, le=1)


class RemixRequest(BaseModel):
    remix_intent: str = Field(default="Creative variation", min_length=3, max_length=500)
    title: str | None = Field(default=None, max_length=60)


class RemixSourceResponse(BaseModel):
    work_id: str
    remix_intent: str | None = None
    output_title: str | None = None


class JobResponse(BaseModel):
    id: str
    status: str
    progress: float
    current_step: int
    total_steps: int
    phase: str | None = None
    result: dict | None = None
    error_message: str | None = None
    error_code: str | None = None
    status_message: str | None = None
    job_type: str | None = None
    remix_source: RemixSourceResponse | None = None
    credits_balance: int | None = None
    task_reward: dict | None = None
    version: int = 1
    queue_ahead: int | None = None
    estimated_wait_seconds: int | None = None
    compose_eta_seconds: int | None = None
    priority_lane: bool | None = None


class WorkResponse(BaseModel):
    id: str
    title: str
    description: str | None = None
    audio_url: str
    hls_url: str | None = None
    cover_url: str | None = None
    duration: float | None = None
    moods: list[str] = []
    genres: list[str] = []
    arousal: float | None = None
    valence: float | None = None
    visibility: str
    parent_work_id: str | None = None
    parent_work_title: str | None = None
    allow_remix: bool = True
    license: str = "allow_remix"
    post_process_status: dict | None = None
    c2pa_verified: bool = False
    version: int = 1
    is_ai_generated: bool = True
    lyrics: str | None = None
    lyrics_timeline: list[dict] | None = None


class WorkUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    expected_version: int | None = Field(default=None, ge=1)
    sync_community_caption: bool | None = None


class WorkUpdateResponse(WorkResponse):
    post_caption_synced: bool = False


class ProvenanceResponse(BaseModel):
    work_id: str
    lineage: list[dict]
    pipeline_version: str
    verification_url: str


class PostCreate(BaseModel):
    work_id: str
    caption: str | None = None
    tags: list[str] = []
    visibility: str = "public"
    allow_remix: bool = True
    license: str = "allow_remix"
    content_compliance_acknowledged: bool = False


class PostResponse(BaseModel):
    id: str
    work_id: str
    author_id: str
    author_username: str
    author_creator_level: str | None = None
    caption: str | None = None
    tags: list[str] = []
    like_count: int
    comment_count: int
    liked_by_me: bool = False
    author_is_following: bool = False
    collected_by_me: bool = False
    work: WorkResponse | None = None
    created_at: str
    recommend_reason: str | None = None
    task_reward: dict | None = None
    credits_balance: int | None = None


class CommentCreate(BaseModel):
    content: str = Field(min_length=1, max_length=2000)
    parent_id: str | None = None


class CommentResponse(BaseModel):
    id: str
    user_id: str
    username: str
    content: str
    parent_id: str | None = None
    is_filtered: bool = False
    created_at: str
