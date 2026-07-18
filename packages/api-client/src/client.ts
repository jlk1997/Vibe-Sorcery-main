import {
  API_BASE,
  ApiError,
  getToken,
  httpFetch,
  parseErrorDetail,
  parseResponse,
  request,
  uploadRequest,
} from "./core";
import { subscribeJobTracker, type JobPayload } from "./jobTracker";

export const api = {
  register: (
    email: string,
    username: string,
    password: string,
    referralCode?: string,
    acceptedTermsVersion?: string,
    acceptedPrivacyVersion?: string,
  ) =>
    request<{ access_token: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email,
        username,
        password,
        ...(referralCode ? { referral_code: referralCode } : {}),
        accepted_terms_version: acceptedTermsVersion,
        accepted_privacy_version: acceptedPrivacyVersion,
      }),
    }),
  login: (email: string, password: string) =>
    request<{ access_token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () =>
    request<{
      id: string;
      username: string;
      email: string;
      tenant_id?: string;
      is_tenant_admin?: boolean;
      is_admin?: boolean;
      deletion_scheduled_at?: string | null;
      consent_missing?: string[];
    }>("/auth/me"),
  analyzeEmotion: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return uploadRequest<{ moods: string[]; genres: string[]; arousal?: number; valence?: number }>(
      "/emotion/analyze",
      form
    );
  },
  generatePlaylist: (opts: {
    file?: File | null;
    seedWorkId?: string | null;
    textIntent?: string;
    presetId?: string | null;
    generationMode?: string;
    steps: number;
    targetCurve: string;
    instrumental?: boolean;
    title?: string;
    waypoints?: Array<{ step: number; arousal: number; valence: number; description?: string }>;
    musicParams?: { bpm_range: [number, number]; key: string; duration_preference: string };
    creativeSpec?: Record<string, unknown>;
    reference?: { work_id: string; av_offset?: { arousal: number; valence: number } };
    idempotencyKey?: string;
  }) => {
    const form = new FormData();
    if (opts.file) form.append("file", opts.file);
    if (opts.seedWorkId) form.append("seed_work_id", opts.seedWorkId);
    if (opts.textIntent) form.append("text_intent", opts.textIntent);
    if (opts.presetId) form.append("preset_id", opts.presetId);
    form.append("generation_mode", opts.generationMode || "prompt_journey");
    form.append("steps", String(opts.steps));
    form.append("target_curve", opts.targetCurve);
    form.append("instrumental", String(opts.instrumental ?? true));
    if (opts.title) form.append("title", opts.title);
    if (opts.waypoints?.length) form.append("waypoints_json", JSON.stringify(opts.waypoints));
    if (opts.reference) {
      form.append(
        "journey_json",
        JSON.stringify({
          mode: opts.generationMode || "prompt_journey",
          steps: opts.steps,
          target_curve: opts.targetCurve,
          instrumental: opts.instrumental ?? true,
          title: opts.title,
          waypoints: opts.waypoints || [],
          reference: opts.reference,
        })
      );
    }
    if (opts.musicParams) {
      form.append("bpm_min", String(opts.musicParams.bpm_range[0]));
      form.append("bpm_max", String(opts.musicParams.bpm_range[1]));
      form.append("key", opts.musicParams.key);
      form.append("duration_preference", opts.musicParams.duration_preference);
    }
    if (opts.creativeSpec) {
      form.append("creative_spec_json", JSON.stringify(opts.creativeSpec));
    }
    return uploadRequest<{ id: string; status: string; progress: number; current_step: number; total_steps: number }>(
      "/works/generate/playlist",
      form,
      { idempotencyKey: opts.idempotencyKey },
    );
  },
  getPresets: () =>
    request<
      Array<{
        id: string;
        label: string;
        category?: string;
        description?: string;
        example_intent?: string;
        member_only?: boolean;
      }>
    >("/config/presets"),
  applyPreset: (presetId: string, steps = 6, textIntent?: string) =>
    request<{
      preset_id: string;
      text_intent: string;
      moods: string[];
      genres: string[];
      journey: Record<string, unknown>;
      music_params: { bpm_range: number[]; key: string; duration_preference: string };
    }>("/studio/apply-preset", {
      method: "POST",
      body: JSON.stringify({ preset_id: presetId, steps, text_intent: textIntent }),
    }),
  getUserProfile: (username: string) =>
    request<{
      username: string;
      display_name?: string;
      bio?: string;
      avatar_url?: string;
      stats: { works: number; followers: number; following: number };
      is_following?: boolean | null;
    }>(`/users/${username}/profile`),
  getUserWorks: (username: string) =>
    request<
      Array<{
        id: string;
        title: string;
        audio_url: string;
        hls_url?: string;
        cover_url?: string;
        moods: string[];
        post_process_status?: Record<string, unknown>;
        c2pa_verified?: boolean;
      }>
    >(`/users/${username}/works`),
  getUserPosts: (username: string) =>
    request<
      Array<{
        id: string;
        caption?: string;
        like_count: number;
        comment_count?: number;
        liked_by_me?: boolean;
        author_username?: string;
        tags?: string[];
        work?: {
          id: string;
          title: string;
          audio_url: string;
          hls_url?: string;
          cover_url?: string;
          moods?: string[];
        };
      }>
    >(`/users/${username}/posts`),
  followUser: (username: string) =>
    request<{ following: boolean }>(`/community/follow/${username}`, { method: "POST" }),
  updateProfile: (display_name?: string, bio?: string) =>
    request<{ display_name?: string; bio?: string }>("/users/me/profile", {
      method: "PUT",
      body: JSON.stringify({ display_name, bio }),
    }),
  getMyProfile: () =>
    request<{ username: string; display_name?: string; bio?: string; avatar_url?: string }>("/users/me/profile"),
  getEmotionTags: () =>
    request<{ mood_tags: string[]; genre_tags: string[] }>("/emotion/tags"),
  listCollections: () =>
    request<Array<{ id: string; work: { id: string; title: string; audio_url: string; hls_url?: string; cover_url?: string; moods: string[] }; created_at: string }>>(
      "/collections"
    ),
  getPlatformConfig: () =>
    request<{
      studio: {
        curves: string[];
        keys: string[];
        bpm_presets: Array<{ label: string; range: [number, number] }>;
        duration_options: Array<{ value: string; label: string }>;
        sound_recipe?: {
          instruments: Array<{ id: string; label_zh?: string; label_en?: string; token?: string }>;
          genres: Array<{ id: string; label_zh?: string; label_en?: string; token?: string }>;
          moods: Array<{ id: string; label_zh?: string; token?: string }>;
          tempo_feel: Array<{ id: string; label_zh?: string; label_en?: string }>;
          textures: Array<{ id: string; label_zh?: string; token?: string }>;
          meters: Array<{ id: string; label_zh?: string; token?: string }>;
          eras: Array<{ id: string; label_zh?: string; token?: string }>;
        };
        max_lyrics_length: number;
        default_bpm_range: [number, number];
        default_key: string;
        default_duration: string;
      };
      minimax: { lyrics_optimizer_default: boolean; cover_mode_default: string };
    }>("/config/platform"),
  getFeatureFlags: () => request<Record<string, boolean>>("/config/flags"),
  cancelJob: (jobId: string) =>
    request<{ id: string; status: string }>(`/jobs/${jobId}/cancel`, { method: "POST" }),
  pickVariationPrimary: (jobId: string, workId: string) =>
    request<{ id: string; status: string; result?: Record<string, unknown> }>(`/jobs/${jobId}/pick-variation`, {
      method: "POST",
      body: JSON.stringify({ work_id: workId }),
    }),
  planTextJourney: (textIntent: string, steps = 6) =>
    request<{ title: string; target_curve: string; steps: number; waypoints: Array<{ step: number; arousal: number; valence: number; description?: string }> }>(
      "/studio/journey/plan",
      { method: "POST", body: JSON.stringify({ text_intent: textIntent, steps }) }
    ),
  coverPreprocess: (workId: string) =>
    request<{ cover_feature_id?: string; formatted_lyrics?: string; structure_result?: unknown; audio_duration?: number }>(
      "/studio/music-cover/preprocess",
      { method: "POST", body: JSON.stringify({ work_id: workId, prompt: "preview" }) }
    ),
  getWorkRefineHints: (workId: string) =>
    request<{
      work_id: string;
      title: string;
      bpm?: number | null;
      key?: string | null;
      arousal?: number | null;
      valence?: number | null;
      moods?: string[];
      suggested_intent: string;
    }>(`/studio/works/${workId}/refine-hints`),
  getJob: (id: string) =>
    request<{
      id: string;
      status: string;
      progress: number;
      current_step: number;
      total_steps: number;
      phase?: string | null;
      job_type?: string | null;
      remix_source?: { work_id: string; remix_intent?: string | null; output_title?: string | null } | null;
      result?: {
        work_id?: string;
        audio_url?: string;
        title?: string;
        cover_url?: string;
        hls_url?: string;
        playlist_id?: string;
        work_ids?: string[];
        completed_steps?: Array<{ work_id: string; step: number; audio_url?: string; title?: string }>;
      };
      error_message?: string;
      status_message?: string;
    }>(`/jobs/${id}`),
  getActiveJob: () =>
    request<{
      id: string;
      status: string;
      progress: number;
      current_step: number;
      total_steps: number;
      phase?: string | null;
      job_type?: string | null;
      remix_source?: { work_id: string; remix_intent?: string | null; output_title?: string | null } | null;
      result?: Record<string, unknown>;
      error_message?: string;
      status_message?: string;
    } | null>(`/jobs/active`),
  listWorks: (sort = "newest", mood?: string) =>
    request<
      Array<{
        id: string;
        title: string;
        audio_url: string;
        hls_url?: string;
        cover_url?: string;
        moods: string[];
        parent_work_id?: string;
        post_process_status?: Record<string, unknown>;
        c2pa_verified?: boolean;
        visibility?: string;
        version?: number;
      }>
    >(`/works?sort=${sort}${mood ? `&mood=${encodeURIComponent(mood)}` : ""}`),
  getWork: (workId: string) =>
    request<{
      id: string;
      title: string;
      audio_url: string;
      hls_url?: string;
      cover_url?: string;
      moods: string[];
      allow_remix?: boolean;
      license?: string;
      version?: number;
      lyrics?: string;
      lyrics_timeline?: Array<{ time: number; text: string }>;
    }>(`/works/${workId}`),
  getWorkQuality: (workId: string) =>
    request<{ resonance: number; completion: number; suggestion_key: "mood" | "structure" | "publish" }>(
      `/works/${workId}/quality`
    ),
  getMoodVisual: (workId: string) =>
    request<{
      work_id: string;
      title: string;
      audio_url: string;
      cover_url?: string;
      slides: Array<Record<string, unknown>>;
      total_duration_sec: number;
    }>(`/studio/works/${workId}/mood-visual`),
  exportMoodVisual: (workId: string) =>
    request<{ id: string; export_type: string; download_url: string; cost: number; meta: Record<string, unknown> }>(
      `/studio/works/${workId}/mood-visual/export`,
      { method: "POST" }
    ),
  updateWork: (
    workId: string,
    payload: { title?: string; expectedVersion?: number; syncCommunityCaption?: boolean | null },
  ) =>
    request<{ id: string; title: string; version: number; post_caption_synced?: boolean }>(`/works/${workId}`, {
      method: "PATCH",
      headers:
        payload.expectedVersion != null ? { "If-Match": String(payload.expectedVersion) } : undefined,
      body: JSON.stringify({
        title: payload.title,
        expected_version: payload.expectedVersion,
        sync_community_caption: payload.syncCommunityCaption,
      }),
    }),
  getFeed: (sort = "personalized", tag?: string) => {
    const params = new URLSearchParams({ sort });
    if (tag) params.set("tag", tag);
    return request<
      Array<{
        id: string;
        caption?: string;
        like_count: number;
        comment_count: number;
        liked_by_me?: boolean;
        author_is_following?: boolean;
        collected_by_me?: boolean;
        author_username: string;
        author_creator_level?: string;
        tags?: string[];
        work?: {
          id: string;
          audio_url: string;
          hls_url?: string;
          cover_url?: string;
          title: string;
          moods: string[];
          allow_remix?: boolean;
          license?: string;
          post_process_status?: Record<string, unknown>;
          c2pa_verified?: boolean;
        };
      }>
    >(`/community/feed?${params.toString()}`);
  },
  getRisingCreators: (limit = 5) =>
    request<
      Array<{
        username: string;
        display_name: string;
        avatar_url?: string;
        posts_count: number;
        creator_level: string;
      }>
    >(`/community/rising-creators?limit=${limit}`),
  getChallenges: () =>
    request<
      Array<{
        id: string;
        slug: string;
        title: string;
        description?: string;
        hashtag: string;
        target_curve?: string;
        cover_url?: string;
        ends_at?: string | null;
        participant_count: number;
        prize_pool_credits?: number;
      }>
    >("/challenges"),
  getChallengeLeaderboard: (slug: string, limit = 20) =>
    request<{ slug: string; title: string; entries: Array<{ rank: number; work_id: string; title: string; author: string; like_count: number; cover_url?: string }> }>(
      `/challenges/${slug}/leaderboard?limit=${limit}`
    ),
  getCreatorStats: () =>
    request<{
      works_total: number;
      published: number;
      remix_derivatives: number;
      remixes_received: number;
      total_likes: number;
      likes_7d: number;
      completed_jobs: number;
      challenge_entries: number;
      followers: number;
    }>("/users/me/creator-stats"),
  getChallenge: (slug: string) =>
    request<{
      slug: string;
      title: string;
      description?: string;
      hashtag: string;
      target_curve?: string;
      cover_url?: string;
      ends_at?: string | null;
      participant_count: number;
      entries: Array<{
        work_id: string;
        title: string;
        author: string;
        moods?: string[];
        audio_url?: string;
        hls_url?: string;
        cover_url?: string;
        like_count?: number;
      }>;
    }>(`/challenges/${slug}`),
  enterChallenge: (slug: string, workId: string, caption?: string) =>
    request<{
      entry_id: string;
      post_id: string;
      task_reward?: { task_key: string; credits_granted: number; balance: number; duplicate?: boolean } | null;
    }>(`/challenges/${slug}/enter`, {
      method: "POST",
      body: JSON.stringify({ work_id: workId, caption }),
    }),
  planCustomJourney: (
    waypoints: Array<{ step: number; arousal: number; valence: number; description?: string }>,
    title: string
  ) =>
    request<{ journey: Record<string, unknown>; music_params: Record<string, unknown> }>("/studio/journey/custom", {
      method: "POST",
      body: JSON.stringify({ title, waypoints, instrumental: true }),
    }),
  musicCover: (
    workId: string,
    prompt: string,
    options?: { cover_mode?: "one_step" | "two_step"; modified_lyrics?: string; idempotencyKey?: string },
  ) =>
    request<{ job_id: string }>("/studio/music-cover", {
      method: "POST",
      idempotencyKey: options?.idempotencyKey,
      body: JSON.stringify({
        work_id: workId,
        prompt,
        cover_mode: options?.cover_mode || "one_step",
        modified_lyrics: options?.modified_lyrics,
      }),
    }),
  adminStats: () => request<Record<string, unknown>>("/admin/stats"),
  adminCommercial: () =>
    request<{
      billing_30d: {
        revenue_yuan: number;
        paid_orders: number;
        period_days: number;
        mrr_yuan?: number;
        ltv_estimate_yuan?: number;
        churned_subscriptions?: number;
        active_subscriptions?: number;
        new_subscriptions?: number;
      };
      pack_distribution: Record<string, number>;
      credit_grants_by_source: Record<string, number>;
      total_credits_spent: number;
      users: number;
      conversion_funnel_30d: Record<string, number>;
    }>("/admin/commercial"),
  adminActivationFunnel: (days = 30) =>
    request<{
      period_days: number;
      new_registrations: number;
      preset_selected: number;
      first_generate_start: number;
      first_generate_complete: number;
      first_listen: number;
      first_publish: number;
    }>(`/admin/activation-funnel?days=${days}`),
  adminAuditLogs: (limit = 50) =>
    request<Array<{ id: string; admin_id: string; action: string; target?: string; detail: Record<string, unknown>; created_at?: string }>>(
      `/admin/audit-logs?limit=${limit}`
    ),
  adminUsage: () =>
    request<
      Array<{
        provider: string;
        model: string;
        endpoint: string;
        tokens_used: number;
        created_at: string | null;
      }>
    >("/admin/usage"),
  adminReports: () =>
    request<
      Array<{
        id: string;
        reason: string;
        status: string;
        post_id?: string | null;
        work_id?: string | null;
        comment_id?: string | null;
        comment_preview?: string | null;
      }>
    >("/admin/reports"),
  adminResolveReport: (id: string, action?: "hide_post" | "hide_comment" | "dismiss") =>
    request(`/admin/reports/${id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ status: "resolved", action: action || null }),
    }),
  adminFlags: () => request<Array<{ key: string; enabled: boolean; description?: string }>>("/admin/flags"),
  adminToggleFlag: (key: string, enabled: boolean) =>
    request(`/admin/flags/${key}`, { method: "PUT", body: JSON.stringify({ enabled }) }),
  adminGrantCredits: (payload: { email?: string; user_id?: string; amount: number }) =>
    request<{ user_id: string; username: string; email: string; balance: number; granted: number }>(
      "/admin/credits/grant",
      { method: "POST", body: JSON.stringify(payload) }
    ),
  createPost: (
    workId: string,
    caption?: string,
    opts?: { allow_remix?: boolean; license?: string; content_compliance_acknowledged?: boolean }
  ) =>
    request<{
      id: string;
      credits_balance?: number;
      task_reward?: { credits_granted?: number; balance?: number; duplicate?: boolean } | null;
    }>("/community/posts", {
      method: "POST",
      body: JSON.stringify({
        work_id: workId,
        caption,
        visibility: "public",
        tags: [],
        allow_remix: opts?.allow_remix ?? true,
        license: opts?.license ?? "allow_remix",
        content_compliance_acknowledged: opts?.content_compliance_acknowledged ?? false,
      }),
    }),
  deletePost: (postId: string) =>
    request<{ deleted: boolean }>(`/community/posts/${postId}`, { method: "DELETE" }),
  getDerivatives: (workId: string) =>
    request<
      Array<{
        id: string;
        title: string;
        audio_url: string;
        cover_url?: string;
        moods: string[];
        parent_work_id?: string;
      }>
    >(`/works/${workId}/derivatives`),
  likePost: (postId: string) =>
    request<{ like_count: number; liked: boolean }>(`/community/posts/${postId}/like`, { method: "POST" }),
  listComments: (postId: string) =>
    request<Array<{ id: string; user_id: string; username: string; content: string; created_at: string }>>(
      `/community/posts/${postId}/comments`
    ),
  addComment: (postId: string, content: string, parentId?: string) =>
    request<{ id: string; user_id: string; username: string; content: string; parent_id?: string | null; is_filtered?: boolean; created_at: string }>(
      `/community/posts/${postId}/comments`,
      { method: "POST", body: JSON.stringify({ content, parent_id: parentId }) }
    ),
  deleteComment: (postId: string, commentId: string) =>
    request<{ deleted: boolean }>(`/community/posts/${postId}/comments/${commentId}`, { method: "DELETE" }),
  remix: (workId: string, remixIntent: string, opts?: { title?: string; idempotencyKey?: string }) =>
    request<{
      job_id: string;
      credits_balance?: number;
      task_reward?: { task_key: string; credits_granted: number; balance: number; duplicate?: boolean } | null;
    }>(`/community/remix/${workId}`, {
      method: "POST",
      idempotencyKey: opts?.idempotencyKey,
      body: JSON.stringify({
        remix_intent: remixIntent,
        ...(opts?.title?.trim() ? { title: opts.title.trim().slice(0, 60) } : {}),
      }),
    }),
  getProvenance: (workId: string) =>
    request<{ work_id: string; lineage: Array<Record<string, unknown>>; pipeline_version: string }>(`/provenance/${workId}`),
  exportProvenance: async (workId: string, format = "vibe") => {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await httpFetch(
      `${API_BASE}/provenance/${workId}/export?format=${encodeURIComponent(format)}`,
      { headers }
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(parseErrorDetail(body, res.status), res.status);
    }
    if (!res.blob) throw new ApiError("Blob not supported", 500);
    return res.blob();
  },
  generatePlaylistBody: (payload: Record<string, unknown>, idempotencyKey?: string) =>
    request<{ id: string; status: string }>("/works/generate/playlist/body", {
      method: "POST",
      idempotencyKey,
      body: JSON.stringify(payload),
    }),
  wechatLogin: (
    code: string,
    acceptedTermsVersion?: string,
    acceptedPrivacyVersion?: string,
  ) =>
    request<{ access_token: string; token_type: string; user_id: string }>("/auth/wechat/login", {
      method: "POST",
      body: JSON.stringify({
        code,
        accepted_terms_version: acceptedTermsVersion,
        accepted_privacy_version: acceptedPrivacyVersion,
      }),
    }),
  generateLyrics: (theme: string, moods: string[] = [], language = "zh") =>
    request<{ lyrics: string; style_tags?: string | null; song_title?: string | null }>(
      "/studio/lyrics/generate",
      {
      method: "POST",
      body: JSON.stringify({ theme, moods, language }),
    }),
  polishIntent: (textIntent: string) =>
    request<{ text_intent: string }>("/studio/intent/polish", {
      method: "POST",
      body: JSON.stringify({ text_intent: textIntent }),
    }),
  parseMusicIntent: (textIntent: string, language = "zh") =>
    request<{
      creative_spec: {
        instruments: string[];
        genres: string[];
        moods: string[];
        tempo_feel: string;
        bpm?: number | null;
        bpm_range?: [number, number] | null;
        key: string;
        texture: string;
        meter: string;
        era: string;
        text_intent: string;
        style_tags: string;
      };
      preview_prompt: string;
    }>("/studio/intent/parse", {
      method: "POST",
      body: JSON.stringify({ text_intent: textIntent, language }),
    }),
  previewMusicPrompt: (payload: {
    creative_spec?: Record<string, unknown>;
    text_intent?: string;
    style_tags?: string;
    moods?: string[];
    genres?: string[];
    bpm?: number;
    key?: string;
  }) =>
    request<{ creative_spec: Record<string, unknown>; preview_prompt: string }>("/studio/prompt/preview", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getSoundRecipeOptions: () =>
    request<{
      instruments: Array<{ id: string; label_zh?: string; label_en?: string; token?: string }>;
      genres: Array<{ id: string; label_zh?: string; label_en?: string; token?: string }>;
      moods: Array<{ id: string; label_zh?: string; token?: string }>;
      tempo_feel: Array<{ id: string; label_zh?: string; label_en?: string }>;
      textures: Array<{ id: string; label_zh?: string; token?: string }>;
      meters: Array<{ id: string; label_zh?: string; token?: string }>;
      eras: Array<{ id: string; label_zh?: string; token?: string }>;
    }>("/studio/sound-recipe/options"),
  generateSingle: (payload: {
    text_intent?: string;
    seed_work_id?: string;
    instrumental?: boolean;
    title?: string;
    lyrics?: string;
    style_tags?: string;
    song_title?: string;
    lyrics_optimizer?: boolean;
    creative_spec?: Record<string, unknown>;
    bpm?: number;
    key?: string;
    moods?: string[];
    genres?: string[];
    seed?: number;
    reference?: { work_id: string; av_offset?: { arousal?: number; valence?: number } };
    preview_pick_count?: number;
    idempotencyKey?: string;
  }) =>
    request<{ id: string; status: string; job_type?: string }>("/works/generate/single", {
      method: "POST",
      idempotencyKey: payload.idempotencyKey,
      body: JSON.stringify(payload),
    }),
  listPlaylists: () => request<Array<{ id: string; title: string; track_count: number }>>("/playlists"),
  listPlaylistSubscriptions: () =>
    request<
      Array<{
        id: string;
        title: string;
        owner_username?: string;
        track_count: number;
        visibility: string;
        subscribed_at?: string | null;
      }>
    >("/playlists/subscriptions"),
  subscribePlaylist: (playlistId: string) =>
    request<{ subscribed: boolean; playlist_id: string }>(`/playlists/${playlistId}/subscribe`, { method: "POST" }),
  unsubscribePlaylist: (playlistId: string) =>
    request<{ subscribed: boolean }>(`/playlists/${playlistId}/subscribe`, { method: "DELETE" }),
  getPlaylist: (id: string) =>
    request<{
      id: string;
      title: string;
      visibility?: string;
      share_text?: string;
      tracks: Array<{
        position: number;
        shift_stage?: string;
        work: { id: string; title: string; audio_url: string; hls_url?: string; cover_url?: string; moods?: string[] };
      }>;
    }>(`/playlists/${id}`),
  publishPlaylist: (id: string, visibility: "public" | "private" | "unlisted") =>
    request<{ id: string; title: string; visibility: string }>(`/playlists/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ visibility }),
    }),
  getPublicPlaylist: (id: string) =>
    request<{
      id: string;
      title: string;
      visibility: string;
      share_text?: string;
      tracks: Array<{ position: number; shift_stage?: string; work: { id: string; title: string } }>;
    }>(`/playlists/${id}/public`),
  collectWork: (workId: string) => request<{ collected: boolean }>(`/collections/${workId}`, { method: "POST" }),
  removeCollection: (workId: string) =>
    request<{ collected: boolean }>(`/collections/${workId}`, { method: "DELETE" }),
  triggerPostProcess: (workId: string) =>
    request<{ status: string }>(`/studio/works/${workId}/post-process`, { method: "POST" }),
  submitPlaylistFeedback: (
    playlistId: string,
    body: { mood_before: number; mood_after: number; felt_shift?: boolean; note?: string },
  ) =>
    request<{ id: string }>(`/playlists/${playlistId}/feedback`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getPlaylistFeedback: (playlistId: string) =>
    request<{ mood_before: number; mood_after: number; felt_shift?: boolean; note?: string } | null>(
      `/playlists/${playlistId}/feedback`,
    ),
  trackEvent: (event: string, payload?: Record<string, unknown>) =>
    request<{ ok: boolean }>("/analytics/events", {
      method: "POST",
      body: JSON.stringify({ event, payload: payload || {} }),
    }).catch(() => ({ ok: false })),
  createSubscriptionCheckout: () =>
    request<{ mode: string; url?: string; credits_granted?: number; balance?: number }>(
      "/billing/subscribe",
      { method: "POST" }
    ),
  getSubscription: () =>
    request<{
      tier: string;
      status: string;
      plan_id?: string | null;
      channel?: string | null;
      monthly_credits: number;
      renews_at: string | null;
      cancel_at_period_end?: boolean;
      days_remaining?: number | null;
      perks?: { priority_queue: boolean; exclusive_presets: boolean };
      can_manage_stripe?: boolean;
    }>("/billing/subscription"),
  cancelSubscription: (immediate = false) =>
    request<{ cancelled: boolean; subscription: Record<string, unknown> }>("/billing/subscription/cancel", {
      method: "POST",
      body: JSON.stringify({ immediate }),
    }),
  getBillingPortal: () => request<{ url?: string }>("/billing/portal"),
  getPreferences: () => request<{ mood_tags: string[]; genre_tags: string[] }>("/users/me/preferences"),
  updatePreferences: (mood_tags: string[], genre_tags: string[]) =>
    request("/users/me/preferences", {
      method: "PUT",
      body: JSON.stringify({ mood_tags, genre_tags }),
    }),
  pollJob: (
    jobId: string,
    onUpdate: (data: { status: string; progress: number; error_message?: string }) => void,
    intervalMs = 2000
  ) => {
    let stopped = false;
    let delay = Math.min(intervalMs, 800);
    const tick = async () => {
      if (stopped) return;
      try {
        const data = await request<{ status: string; progress: number; error_message?: string }>(`/jobs/${jobId}`);
        onUpdate(data);
        if (data.status === "completed" || data.status === "failed" || data.status === "cancelled") return;
        delay = Math.min(delay * 1.5, 4000);
      } catch {
        delay = Math.min(delay * 1.5, 4000);
      }
      setTimeout(tick, delay);
    };
    tick();
    return () => {
      stopped = true;
    };
  },
  watchJob: async (jobId: string, onUpdate: (data: Record<string, unknown>) => void) => {
    try {
      const { ticket } = await request<{ ticket: string }>(`/jobs/${jobId}/stream-ticket`, { method: "POST" });
      const wsUrl =
        API_BASE.replace(/^http/, "ws") + `/jobs/${jobId}/stream?ticket=${encodeURIComponent(ticket)}`;
      const ws = new WebSocket(wsUrl);
      ws.onmessage = (ev) => onUpdate(JSON.parse(ev.data) as Record<string, unknown>);
      ws.onerror = () => ws.close();
      return ws;
    } catch {
      return null;
    }
  },
  trackJob: (
    jobId: string,
    onUpdate: (data: {
      status: string;
      progress: number;
      current_step?: number;
      total_steps?: number;
      phase?: string | null;
      job_type?: string | null;
      remix_source?: { work_id: string; remix_intent?: string | null; output_title?: string | null } | null;
      result?: Record<string, unknown>;
      error_message?: string;
      status_message?: string;
    }) => void
  ) => subscribeJobTracker(jobId, onUpdate as (data: JobPayload) => void),
  verifyProvenance: (workId: string) =>
    request<{
      verified: boolean;
      content_hash?: string;
      signature?: string;
      c2pa_manifest?: Record<string, unknown>;
      blockchain_tx_hash?: string;
    }>(`/provenance/${workId}/verify`),
  reportPost: (postId: string, reason: string) =>
    request("/community/report", { method: "POST", body: JSON.stringify({ post_id: postId, reason }) }),
  reportComment: (commentId: string, reason: string) =>
    request("/community/report", { method: "POST", body: JSON.stringify({ comment_id: commentId, reason }) }),
  previewRemix: (workId: string, remixIntent: string) =>
    request<{ original_prompt?: string; prompt?: string; bpm?: number; key?: string }>("/studio/remix/preview", {
      method: "POST",
      body: JSON.stringify({ work_id: workId, remix_intent: remixIntent }),
    }),
  getRemixTree: (workId: string) =>
    request<{
      id: string;
      title: string;
      author?: string;
      children?: Array<{ id: string; title: string; author?: string; moods?: string[]; children?: unknown[] }>;
      ancestors?: Array<{ id: string; title: string; author?: string }>;
    }>(`/works/${workId}/remix-tree`),
  getNotifications: () =>
    request<{
      unread_count: number;
      items: Array<{ id: string; type: string; payload: Record<string, unknown>; read: boolean; created_at?: string }>;
    }>("/notifications"),
  markNotificationsRead: (opts: { notification_id?: string; all?: boolean }) =>
    request<{ marked: number }>("/notifications/read", { method: "POST", body: JSON.stringify(opts) }),
  copilotChat: (message: string, sessionId?: string) =>
    request<{
      session_id: string;
      reply: string;
      tool_result?: Record<string, unknown>;
      tool_name?: string;
      actions?: Array<Record<string, unknown>>;
      messages: Array<{ role: string; content: string; tool_result?: Record<string, unknown> }>;
    }>("/copilot/chat", {
      method: "POST",
      body: JSON.stringify({ message, session_id: sessionId }),
    }),
  copilotChatStream: async (
    message: string,
    sessionId: string | undefined,
    onDelta: (text: string) => void
  ): Promise<{
    session_id: string;
    reply: string;
    actions?: Array<Record<string, unknown>>;
    tool_name?: string;
    tool_result?: Record<string, unknown>;
  }> => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const t = getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
    const res = await fetch(`${API_BASE}/copilot/chat/stream`, {
      method: "POST",
      headers,
      body: JSON.stringify({ message, session_id: sessionId }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(err || `Copilot stream failed (${res.status})`);
    }
    const reader = res.body?.getReader();
    if (!reader) {
      return request<{
        session_id: string;
        reply: string;
        tool_name?: string;
        tool_result?: Record<string, unknown>;
        actions?: Array<Record<string, unknown>>;
      }>("/copilot/chat", {
        method: "POST",
        body: JSON.stringify({ message, session_id: sessionId }),
      });
    }
    const decoder = new TextDecoder();
    let buffer = "";
    let donePayload: Record<string, unknown> | null = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith("data:")) continue;
        const data = JSON.parse(line.slice(5).trim()) as Record<string, unknown>;
        if (data.type === "delta" && typeof data.text === "string") onDelta(data.text);
        if (data.type === "done") donePayload = data;
      }
    }
    if (!donePayload) throw new Error("Copilot stream ended without done event");
    return {
      session_id: String(donePayload.session_id || ""),
      reply: String(donePayload.reply || ""),
      actions: (donePayload.actions as Array<Record<string, unknown>>) || [],
      tool_name: donePayload.tool_name as string | undefined,
      tool_result: donePayload.tool_result as Record<string, unknown> | undefined,
    };
  },
  copilotListSessions: () =>
    request<Array<{ id: string; title: string; message_count: number; updated_at: string | null }>>("/copilot/sessions"),
  copilotUsage: () =>
    request<{ is_member: boolean; daily_limit: number | null; daily_used: number; daily_remaining: number | null }>(
      "/copilot/usage"
    ),
  copilotGetSession: (sessionId: string) =>
    request<{
      id: string;
      title: string;
      messages: Array<{
        role: string;
        content: string;
        tool_result?: Record<string, unknown>;
        actions?: Array<Record<string, unknown>>;
      }>;
      context: Record<string, unknown>;
    }>(`/copilot/sessions/${sessionId}`),
  copilotDeleteSession: (sessionId: string) =>
    request<{ deleted: boolean }>(`/copilot/sessions/${sessionId}`, { method: "DELETE" }),
  getCreditPacks: () =>
    request<
      Array<{
        id: string;
        credits: number;
        amount_cents: number;
        amount_fen?: number;
        label: string;
        currency_usd?: string;
        currency_cny?: string;
        price_cny_yuan?: number;
        stripe_enabled?: boolean;
        wechat_enabled?: boolean;
        alipay_enabled?: boolean;
      }>
    >("/billing/packs"),
  getPaymentMethods: () =>
    request<{ mock_mode: boolean; channels: Array<{ id: string; label: string; enabled: boolean; scenes: Array<{ id: string; label: string; for: string }> }> }>(
      "/billing/methods"
    ),
  getSubscriptionPlans: () =>
    request<
      Array<{
        id: string;
        label: string;
        description?: string;
        monthly_credits: number;
        price_cny_yuan?: number;
        amount_fen?: number;
      }>
    >("/billing/plans"),
  createPayment: (
    packId: string,
    channel: "wechat" | "alipay" | "stripe",
    scene: string,
    acceptedPaymentTermsVersion?: string,
  ) =>
    request<{
      mode?: string;
      url?: string;
      pay_url?: string;
      code_url?: string;
      out_trade_no?: string;
      credits_granted?: number;
      balance?: number;
      subscription?: { tier: string; status: string; monthly_credits: number; renews_at: string | null };
      payment?: {
        timeStamp: string;
        nonceStr: string;
        package: string;
        signType: string;
        paySign: string;
      };
    }>("/billing/pay", {
      method: "POST",
      body: JSON.stringify({
        pack_id: packId,
        channel,
        scene,
        accepted_payment_terms_version: acceptedPaymentTermsVersion,
      }),
    }),
  listPaymentOrders: (limit = 20) =>
    request<
      Array<{
        out_trade_no: string;
        label: string;
        channel: string;
        amount_yuan: number;
        status: string;
        paid_at?: string | null;
        created_at?: string | null;
      }>
    >(`/billing/orders?limit=${limit}`),
  getPaymentOrderStatus: (outTradeNo: string) =>
    request<{ status: string; balance?: number }>(`/billing/orders/${encodeURIComponent(outTradeNo)}`),
  createCreditCheckout: (packId: string) =>
    request<{ mode: string; url?: string; credits_granted?: number; balance?: number }>("/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ pack_id: packId }),
    }),
  getStructureTemplates: () => request<Array<{ id: string; label: string }>>("/studio/structure-templates"),
  applyStructure: (templateId: string, steps: number) =>
    request<{ waypoints: Array<{ step: number; arousal: number; valence: number; description?: string }> }>(
      "/studio/structure/apply",
      { method: "POST", body: JSON.stringify({ template_id: templateId, steps }) }
    ),
  generateVariations: (
    payload: { text_intent?: string; seed_work_id?: string; title?: string; count?: number; idempotencyKey?: string },
  ) =>
    request<{ id: string; status: string }>("/works/generate/variations", {
      method: "POST",
      idempotencyKey: payload.idempotencyKey,
      body: JSON.stringify(payload),
    }),
  searchWorks: (q: string) =>
    request<Array<{ id: string; title: string; audio_url: string; moods: string[] }>>(`/works/search?q=${encodeURIComponent(q)}`),
  getCredits: () => request<{ balance: number }>("/users/me/credits"),
  getCreditTransactions: () =>
    request<Array<{ id: string; pack_id: string | null; credits: number; source: string; created_at: string | null }>>(
      "/users/me/credits/transactions"
    ),
  dailyCheckin: () =>
    request<{ credits_granted: number; balance: number; checkin_date: string; streak_days?: number; streak_bonus?: boolean }>(
      "/users/me/checkin",
      { method: "POST" }
    ),
  getProgress: () =>
    request<{
      level: string;
      stats: { published: number; remixes: number; challenge_entries: number };
      checked_in_today: boolean;
      streak_days?: number;
      daily_checkin_credits: number;
      tasks: Array<{ key: string; label: string; credits: number; completed: boolean }>;
    }>("/users/me/progress"),
  getEmotionCalendar: (days = 60) =>
    request<{
      entries: Array<{
        id: string;
        entry_date: string;
        arousal?: number;
        valence?: number;
        work_id?: string;
        mood_tags?: string[];
      }>;
    }>(`/users/me/emotion-calendar?days=${days}`),
  getMonthlyEmotionAlbum: (year?: number, month?: number) => {
    const params = new URLSearchParams();
    if (year != null) params.set("year", String(year));
    if (month != null) params.set("month", String(month));
    const q = params.toString();
    return request<{
      year: number;
      month: number;
      title: string;
      track_count: number;
      work_ids: string[];
      tracks: Array<{ work_id: string; title: string; date: string; cover_url?: string }>;
      avg_arousal: number;
      avg_valence: number;
      playlist_id?: string | null;
    }>(`/users/me/emotion-calendar/monthly${q ? `?${q}` : ""}`);
  },
  listPublicPlaylists: (limit = 30) =>
    request<Array<{ id: string; title: string; owner_username?: string; track_count: number; visibility: string }>>(
      `/playlists/discover/public?limit=${limit}`
    ),
  listUserWorkPacks: (username: string) =>
    request<Array<{ id: string; title: string; price_credits: number; work_count: number; owner_username?: string }>>(
      `/ecosystem/users/${encodeURIComponent(username)}/work-packs`
    ),
  getApiUsage: () => request<{ monthly_calls: number; quota: number }>("/users/me/api-usage"),
  getReferral: () =>
    request<{
      referral_code: string;
      invites_count: number;
      credits_earned: number;
      referrer_reward: number;
      invitee_reward: number;
      share_url: string;
    }>("/users/me/referral"),
  estimateCredits: (mode = "single", count = 1, variations?: number) => {
    const params = new URLSearchParams({ mode, count: String(count) });
    if (variations != null) params.set("variations", String(variations));
    return request<{ credits: number; mode: string; breakdown: Array<{ label: string; unit_cost: number; quantity: number; subtotal: number }> }>(
      `/billing/estimate?${params}`
    );
  },
  listDrafts: () =>
    request<Array<{ id: string; title: string; mode: string; payload: Record<string, unknown>; version: number }>>(
      "/studio/drafts",
    ),
  saveDraft: (
    title: string,
    mode: string,
    payload: Record<string, unknown>,
    draftId?: string,
    expectedVersion?: number,
  ) =>
    request<{ id: string; version: number }>("/studio/drafts", {
      method: "POST",
      body: JSON.stringify({
        title,
        mode,
        payload,
        draft_id: draftId,
        expected_version: expectedVersion,
      }),
    }),
  deleteDraft: (draftId: string) =>
    request<{ deleted: boolean }>(`/studio/drafts/${draftId}`, { method: "DELETE" }),
  generateCoverImage: (workId: string, prompt?: string) =>
    request<{ cover_url: string }>("/studio/cover-image", {
      method: "POST",
      body: JSON.stringify({ work_id: workId, prompt: prompt || "" }),
    }),
  updatePlaylist: (id: string, payload: { title?: string; visibility?: string }) =>
    request<{ id: string; title: string; visibility: string }>(`/playlists/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  getTenantMembers: () =>
    request<Array<{ id: string; username: string; email: string; display_name?: string; balance: number }>>(
      "/tenant-admin/members"
    ),
  adminSeed: () => request<{ status: string; presets_seeded?: number }>("/admin/seed", { method: "POST" }),
  adminListPresets: () =>
    request<Array<{ id: string; label: string; category: string; description?: string; enabled: boolean; sort_order: number }>>(
      "/admin/presets"
    ),
  adminDisablePreset: (presetId: string) =>
    request<{ id: string; enabled: boolean }>(`/admin/presets/${encodeURIComponent(presetId)}`, { method: "DELETE" }),
  adminCreatePreset: (payload: {
    id: string;
    label: string;
    category?: string;
    description?: string;
    example_intent?: string;
    moods?: string[];
    genres?: string[];
    bpm_range?: number[];
    key?: string;
    duration_preference?: string;
    default_curve?: string;
    sort_order?: number;
    enabled?: boolean;
  }) =>
    request<{ id: string }>("/admin/presets", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getUserFollowers: (username: string) =>
    request<Array<{ username: string; display_name?: string; avatar_url?: string }>>(
      `/users/${encodeURIComponent(username)}/followers`
    ),
  getUserFollowing: (username: string) =>
    request<Array<{ username: string; display_name?: string; avatar_url?: string }>>(
      `/users/${encodeURIComponent(username)}/following`
    ),
  requestAvatarUpload: (contentType = "image/jpeg") =>
    request<{ storage_key: string; upload_url: string }>("/users/me/avatar/upload-url", {
      method: "POST",
      body: JSON.stringify({ content_type: contentType }),
    }),
  confirmAvatarUpload: (storageKey: string) =>
    request<{ avatar_url: string }>("/users/me/avatar/confirm", {
      method: "POST",
      body: JSON.stringify({ storage_key: storageKey }),
    }),
  globalSearch: (q: string) =>
    request<{
      works: Array<{ id: string; title: string; audio_url: string; hls_url?: string; cover_url?: string; moods?: string[] }>;
      users: Array<{ username: string; display_name?: string }>;
      posts: Array<{ id: string; caption?: string; work_id: string }>;
    }>(`/search?q=${encodeURIComponent(q)}`),
  getEmbedWork: (workId: string) =>
    request<{ id: string; title: string; audio_url: string; hls_url?: string }>(`/works/embed/${workId}`),
  getEmbedBranding: (workId: string) =>
    request<{ brand: string; logo_url?: string; accent_color?: string; hide_powered_by?: boolean; plan?: string }>(
      `/works/embed/${workId}/branding`
    ),
  getEmbedBrandingByHost: (host: string) =>
    request<{ brand: string; logo_url?: string; accent_color?: string; hide_powered_by?: boolean; tenant_id?: string }>(
      `/config/embed?host=${encodeURIComponent(host)}`
    ),
  batchDeleteWorks: (workIds: string[]) =>
    request<{ deleted: number }>("/works/batch-delete", {
      method: "POST",
      body: JSON.stringify({ work_ids: workIds }),
    }),
  createChallenge: (payload: {
    slug: string;
    title: string;
    description?: string;
    hashtag: string;
    prize_pool_credits?: number;
    prize_winners?: number;
    sponsor_label?: string;
    duration_days?: number;
    ends_at?: string;
  }) => request("/challenges", { method: "POST", body: JSON.stringify(payload) }),
  adminDistributeChallengePrizes: (challengeId: string) =>
    request<{ distributed: number }>(`/ecosystem/challenges/${challengeId}/distribute-prizes`, { method: "POST" }),
  listApiKeys: () =>
    request<Array<{ id: string; name: string; key_prefix: string; scopes?: string[]; created_at: string | null; last_used_at: string | null }>>(
      "/users/me/api-keys"
    ),
  createApiKey: (name: string, scopes?: string[]) =>
    request<{ id: string; name: string; key_prefix: string; scopes?: string[]; api_key: string; created_at: string | null }>(
      "/users/me/api-keys",
      { method: "POST", body: JSON.stringify({ name, scopes: scopes || ["read", "generate"] }) }
    ),
  revokeApiKey: (keyId: string) => request<{ revoked: boolean }>(`/users/me/api-keys/${keyId}`, { method: "DELETE" }),
  listWebhooks: () =>
    request<
      Array<{
        id: string;
        name: string;
        url: string;
        events: string[];
        enabled: boolean;
        created_at: string | null;
        last_delivery_at: string | null;
        last_error: string | null;
      }>
    >("/users/me/webhooks"),
  createWebhook: (name: string, url: string) =>
    request<{ id: string; name: string; url: string; events: string[]; secret: string }>("/users/me/webhooks", {
      method: "POST",
      body: JSON.stringify({ name, url }),
    }),
  deleteWebhook: (id: string) => request<{ deleted: boolean }>(`/users/me/webhooks/${id}`, { method: "DELETE" }),
  adminTenants: () =>
    request<Array<{ tenant_id: string; users: number; works: number; posts: number }>>("/admin/tenants"),
  adminAssignTenant: (userId: string, tenantId: string) =>
    request<{ user_id: string; username: string; tenant_id: string }>(`/admin/users/${userId}/tenant`, {
      method: "PUT",
      body: JSON.stringify({ tenant_id: tenantId }),
    }),
  adminCreateTenant: (payload: {
    tenant_id: string;
    name: string;
    plan?: string;
    invite_code?: string;
    initial_credits?: number;
  }) =>
    request<{ tenant_id: string; name: string; plan: string; credit_pool: number; invite_code?: string }>(
      "/admin/tenants/create",
      { method: "POST", body: JSON.stringify(payload) }
    ),
  adminGrantTenantPool: (tenantId: string, amount: number) =>
    request<{ tenant_id: string; credit_pool: number; granted: number }>(
      `/admin/tenants/${encodeURIComponent(tenantId)}/credits`,
      { method: "POST", body: JSON.stringify({ amount }) }
    ),
  adminSetTenantAdmin: (userId: string, enabled = true) =>
    request<{ user_id: string; username: string; is_tenant_admin: boolean }>(
      `/admin/users/${userId}/tenant-admin?enabled=${enabled ? "true" : "false"}`,
      { method: "PUT" }
    ),
  getTenantAdmin: () =>
    request<{
      tenant_id: string;
      name: string;
      plan: string;
      credit_pool: number;
      member_count: number;
      embed: { brand: string; logo_url?: string; hide_powered_by?: boolean };
    }>("/tenant-admin"),
  updateTenantEmbed: (payload: {
    brand?: string;
    logo_url?: string;
    accent_color?: string;
    hide_powered_by?: boolean;
    custom_domains?: string[];
  }) =>
    request<{ brand: string; logo_url?: string; hide_powered_by?: boolean }>("/tenant-admin/embed", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  allocateTenantCredits: (email: string, amount: number) =>
    request<{ username: string; allocated: number; member_balance: number; pool_remaining: number }>(
      "/tenant-admin/credits/allocate",
      { method: "POST", body: JSON.stringify({ email, amount }) }
    ),
};

/** Alias for miniprogram / mobile compatibility */
export const vibeApi = api;

// Legal & consent (appended to api object above via extension)
Object.assign(api, {
  getLegalMeta: () =>
    request<{
      company_name?: string;
      contact_email?: string;
      contact_phone?: string;
      icp_number?: string;
      effective_date?: string;
      required_versions?: Record<string, string>;
    }>("/legal/meta"),
  getLegalDocuments: () =>
    request<{
      documents: Array<{ slug: string; title: string; version: string; required_for: string[] }>;
      required_versions: Record<string, string>;
    }>("/legal/documents"),
  getLegalDocument: (slug: string) =>
    request<{ slug: string; title: string; version: string; content: string; effective_date?: string }>(
      `/legal/documents/${slug}`,
    ),
  getConsentStatus: () =>
    request<{
      missing: string[];
      required_versions: Record<string, string>;
      analytics_consent?: boolean;
      ai_notice_accepted?: boolean;
      deletion_scheduled_at?: string | null;
    }>("/legal/consents/status"),
  recordConsents: (consents: Array<{ consent_type: string; version?: string }>, analyticsConsent?: boolean) =>
    request("/legal/consents", {
      method: "POST",
      body: JSON.stringify({ consents, analytics_consent: analyticsConsent }),
    }),
  exportMyData: () => request<Record<string, unknown>>("/users/me/export"),
  deleteAccount: (password?: string) =>
    request<{ scheduled: boolean; deletion_at: string; grace_days: number }>("/users/me/delete-account", {
      method: "POST",
      body: JSON.stringify({ confirm: true, password }),
    }),
  cancelAccountDeletion: () =>
    request<{ cancelled: boolean }>("/users/me/cancel-deletion", { method: "POST" }),
  updateConsents: (analyticsConsent: boolean) =>
    request("/users/me/consents", {
      method: "PUT",
      body: JSON.stringify({ analytics_consent: analyticsConsent }),
    }),
  tipWork: (workId: string, credits: number, publicMessage?: string) =>
    request<{ tipped: number; public?: boolean }>(`/ecosystem/works/${workId}/tip`, {
      method: "POST",
      body: JSON.stringify({ credits, public_message: publicMessage }),
    }),
  getPublicTips: (workId: string) =>
    request<{ tips: Array<{ username: string; credits: number; message?: string; created_at?: string }> }>(
      `/ecosystem/works/${workId}/public-tips`
    ),
  exportWork: (workId: string, exportType: "hq_mp3" | "hq_wav" | "stems" | "commercial_license") =>
    request<{ download_url: string; license_id?: string; meta: Record<string, unknown> }>(
      `/ecosystem/works/${workId}/export`,
      { method: "POST", body: JSON.stringify({ export_type: exportType }) }
    ),
  listRecipeTemplates: () =>
    request<Array<{ id: string; title: string; description?: string; price_credits: number; purchase_count?: number }>>(
      "/ecosystem/templates"
    ),
  listWorkPacks: () =>
    request<Array<{ id: string; title: string; price_credits: number; work_count: number; owner_username?: string }>>(
      "/ecosystem/work-packs"
    ),
  purchaseWorkPack: (packId: string) =>
    request<{ work_ids: string[] }>(`/ecosystem/work-packs/${packId}/purchase`, { method: "POST" }),
  purchaseRecipeTemplate: (templateId: string) =>
    request<{ spec: Record<string, unknown> }>(`/ecosystem/templates/${templateId}/purchase`, { method: "POST" }),
  getCreatorWallet: () =>
    request<{
      balance_credits: number;
      lifetime_earned: number;
      estimated_weekly_royalty?: number;
      recent_tips?: Array<{ amount: number; from_user_id?: string; created_at?: string | null }>;
      recent_royalties?: Array<{ credits: number; created_at?: string | null }>;
    }>("/ecosystem/wallet"),
  getMemberExportQuotas: () =>
    request<{
      is_member: boolean;
      stems: { used: number; limit: number; remaining: number };
      hq_wav: { used: number; limit: number; remaining: number };
      ai_cover: { used: number; limit: number; remaining: number };
      mv_video: { used: number; limit: number; remaining: number };
    }>("/ecosystem/member-quotas"),
  listMyExports: () =>
    request<{
      exports: Array<{
        id: string;
        work_id: string;
        export_type: string;
        status: string;
        download_url?: string;
        title?: string;
        license_id?: string;
        created_at?: string;
      }>;
    }>("/ecosystem/exports"),
  requestInvoice: (payload: { order_id: string; title: string; email: string; tax_id?: string }) =>
    request<{ id: string; status: string; message: string }>("/ecosystem/invoices", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  listMyInvoices: () =>
    request<{
      invoices: Array<{
        id: string;
        order_id: string;
        title: string;
        email: string;
        status: string;
        created_at?: string;
      }>;
    }>("/ecosystem/invoices"),
  getCnRecurringStatus: () =>
    request<{ available: boolean; message: string; on_waitlist?: boolean; manual_renewal?: boolean }>(
      "/billing/cn-recurring/status"
    ),
  joinCnRecurringWaitlist: (channel: "wechat" | "alipay" = "wechat") =>
    request<{ joined: boolean; channel: string; duplicate?: boolean }>("/billing/cn-recurring/waitlist", {
      method: "POST",
      body: JSON.stringify({ channel }),
    }),
  createSupportTicket: (payload: {
    category: "refund" | "billing" | "technical";
    subject: string;
    body: string;
    order_id?: string;
  }) =>
    request<{ id: string; status: string }>("/ecosystem/support-tickets", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  listSupportTickets: () =>
    request<{
      tickets: Array<{
        id: string;
        category: string;
        subject: string;
        status: string;
        resolution?: string;
        admin_note?: string;
        credits_granted?: number;
        created_at?: string;
        resolved_at?: string;
      }>;
    }>("/ecosystem/support-tickets"),
  adminListSupportTickets: () =>
    request<{
      tickets: Array<{
        id: string;
        category: string;
        subject: string;
        body: string;
        status: string;
        order_id?: string;
        user_email?: string;
        created_at?: string;
      }>;
    }>("/ecosystem/admin/support-tickets"),
  adminResolveSupportTicket: (
    ticketId: string,
    payload: {
      resolution: "approved" | "rejected" | "credits_granted" | "stripe_refunded";
      admin_note?: string;
      credits_compensation?: number;
      attempt_stripe_refund?: boolean;
    }
  ) =>
    request<{ id: string; status: string; resolution?: string }>(`/ecosystem/admin/support-tickets/${ticketId}/resolve`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  adminCnRecurringWaitlist: () =>
    request<{
      entries: Array<{ user_id: string; email?: string; channel: string; created_at?: string }>;
    }>("/ecosystem/admin/cn-recurring-waitlist"),
  adminListModerationWords: () =>
    request<Array<{ id: string; pattern: string; category: string; level: string; enabled: boolean }>>(
      "/admin/moderation-words"
    ),
  adminCreateModerationWord: (payload: { pattern: string; category?: string; level?: string }) =>
    request<{ id: string }>("/admin/moderation-words", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  adminDeleteModerationWord: (wordId: string) =>
    request<{ disabled: boolean }>(`/admin/moderation-words/${wordId}`, { method: "DELETE" }),
  listenCheckin: (payload: {
    work_id: string;
    listen_ratio: number;
    arousal?: number;
    valence?: number;
    mood_tags?: string[];
  }) =>
    request<{ duplicate?: boolean; resonance_score?: number; credits_granted?: number }>("/engagement/listen-checkin", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getMoodRadio: (limit = 3) =>
    request<{
      tracks: Array<{
        work_id: string;
        post_id: string;
        title: string;
        author: string;
        cover_url?: string;
        moods: string[];
      }>;
    }>(`/engagement/mood-radio?limit=${limit}`),
  getRemixChain: (workId: string) =>
    request<{ work_id: string; generation_depth: number; direct_remixes: number; chain_label: string }>(
      `/engagement/remix-chain/${workId}`
    ),
  getDuelQuota: () =>
    request<{
      member_free_remaining: number;
      pass_starts_remaining: number;
      start_cost: number;
      is_member: boolean;
    }>("/engagement/duel-quota"),
  getWorkEngagementStats: (workId: string) =>
    request<{
      work_id: string;
      listen_completes: number;
      resonance_avg: number;
      resonance_count: number;
    }>(`/engagement/work-stats/${workId}`),
  getCreatorWeeklySummary: () =>
    request<{ listens: number; tips: number; published: number; remixes: number; duel_mentions?: number }>(
      "/engagement/creator-weekly-summary"
    ),
  getChart: (chartType: string, period = "week") =>
    request<{
      chart_type: string;
      period: string;
      entries: Array<Record<string, unknown>>;
    }>(`/community/charts/${chartType}?period=${period}`),
  getChartHistory: (chartType: string, periodKey?: string) =>
    request<{
      chart_type: string;
      period_key?: string | null;
      snapshot_at?: string | null;
      entries: Array<Record<string, unknown>>;
    }>(`/community/charts/${chartType}/history${periodKey ? `?period_key=${periodKey}` : ""}`),
  getActivityStream: (scope: "global" | "following" = "global", limit = 30) =>
    request<{ events: Array<Record<string, unknown>> }>(`/community/activity-stream?scope=${scope}&limit=${limit}`),
  listDuels: (status?: string) =>
    request<{ duels: Array<Record<string, unknown>> }>(`/community/duels${status ? `?status=${status}` : ""}`),
  getDuel: (duelId: string) => request<Record<string, unknown>>(`/community/duels/${duelId}`),
  createDuel: (workId: string, opponentUsername?: string) =>
    request<{ duel_id: string; status: string }>("/community/duels", {
      method: "POST",
      body: JSON.stringify({ work_id: workId, opponent_username: opponentUsername }),
    }),
  acceptDuel: (duelId: string, workId: string) =>
    request<{ duel_id: string; status: string }>(`/community/duels/${duelId}/accept`, {
      method: "POST",
      body: JSON.stringify({ work_id: workId }),
    }),
  voteDuel: (duelId: string, side: "a" | "b", listenRatio: number, emotionTag?: string) =>
    request<{ voted: boolean }>(`/community/duels/${duelId}/vote`, {
      method: "POST",
      body: JSON.stringify({ side, listen_ratio: listenRatio, emotion_tag: emotionTag }),
    }),
});
