import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { Text, View } from "@tarojs/components";
import Taro, { usePullDownRefresh, useDidShow } from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { workToPlayerTrack } from "@vibe-sorcery/types";
import { PageShell } from "../../components/PageShell";
import { FeedPostItem } from "../../components/community/FeedPostItem";
import { ActivityFeedItem, type ActivityEvent } from "../../components/community/ActivityFeedItem";
import { RisingCreatorsRow, type RisingCreator } from "../../components/community/RisingCreatorsRow";
import { DuelsRow } from "../../components/community/DuelsRow";
import { MoodRadioRow } from "../../components/engagement/MoodRadioRow";
import { AuthBanner, ChipGroup, EmptyState, Icon, LoadingSkeleton, SegmentedControl, showError, showSuccess } from "../../components/ui";
import { CoachMarks } from "../../components/onboarding/CoachMarks";
import { openStackPage } from "../../utils/navigation";
import { STACK_PAGE_ROUTES, socialPage } from "../../constants/routes";
import { exitImmersivePlayerLayout } from "../../platform/layout";
import { vibeApi, type FeedPost } from "../../services/api";
import { bootstrapAuth, isLoggedIn, requireAuth } from "../../utils/auth";
import { useCreditsOptional } from "../../contexts/CreditsProvider";
import { consumeFeedHighlightPostId } from "../../utils/communityNav";
import { readPageCache, writePageCache } from "../../utils/pageCache";
import "./index.scss";
import "../../styles/tab-page.scss";

const TipSheet = lazy(() =>
  import("../../components/commercial/TipSheet").then((m) => ({ default: m.TipSheet }))
);
const DerivativeSheet = lazy(() =>
  import("../../components/studio/DerivativeSheet").then((m) => ({ default: m.DerivativeSheet }))
);

const FEED_CACHE_TTL_MS = 60_000;

type FeedCachePayload = {
  posts: FeedPost[];
  rising: RisingCreator[];
  tagOptions: string[];
  likedIds: string[];
  collectedIds: string[];
};

export default function FeedPage() {
  const { copy } = useLocale();
  const d = copy.discoverUi;
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [risingCreators, setRisingCreators] = useState<RisingCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const [postsError, setPostsError] = useState(false);
  const [sort, setSort] = useState<"personalized" | "following" | "latest" | "trending">("personalized");
  const [tag, setTag] = useState("");
  const [tagOptions, setTagOptions] = useState<string[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [collectedIds, setCollectedIds] = useState<Set<string>>(new Set());
  const [derivative, setDerivative] = useState<{ workId: string; title: string } | null>(null);
  const [openComments, setOpenComments] = useState<Set<string>>(new Set());
  const [highlightPostId, setHighlightPostId] = useState<string | null>(null);
  const initialLoadDoneRef = useRef(false);
  const loadGenRef = useRef(0);
  const likeSeqRef = useRef<Map<string, number>>(new Map());
  const loggedIn = isLoggedIn();
  const creditsCtx = useCreditsOptional();
  const [myUsername, setMyUsername] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [feedView, setFeedView] = useState<"posts" | "activity">("posts");
  const [activityScope, setActivityScope] = useState<"global" | "following">("global");
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState(false);
  const [tipTarget, setTipTarget] = useState<{ workId: string; title?: string } | null>(null);
  const eco = copy.ecosystemUi;

  const cacheKey = useMemo(() => `feed:${sort}:${tag}`, [sort, tag]);

  const applyPayload = useCallback((payload: FeedCachePayload) => {
    setPosts(payload.posts);
    setRisingCreators(payload.rising);
    setTagOptions(payload.tagOptions);
    setLikedIds(new Set(payload.likedIds));
    setCollectedIds(new Set(payload.collectedIds));
  }, []);

  const load = useCallback(
    async (opts?: { force?: boolean; background?: boolean }) => {
      const background = opts?.background ?? false;
      const gen = ++loadGenRef.current;
      bootstrapAuth();

      if (!opts?.force) {
        const cached = readPageCache<FeedCachePayload>(cacheKey, FEED_CACHE_TTL_MS);
        if (cached) {
          applyPayload(cached);
          if (!background) setLoading(false);
        }
      }

      if (!background && !readPageCache<FeedCachePayload>(cacheKey, FEED_CACHE_TTL_MS)) {
        setLoading(true);
      }

      try {
        setPostsError(false);
        const apiSort = sort === "trending" ? "popular" : sort;
        const [data, rising, meRes] = await Promise.all([
          vibeApi.getFeed(apiSort, tag || undefined),
          vibeApi.getRisingCreators().catch(() => [] as RisingCreator[]),
          loggedIn ? vibeApi.me().catch(() => null) : Promise.resolve(null),
        ]);
        if (meRes?.username) setMyUsername(meRes.username);
        if (meRes?.id) setMyUserId(meRes.id);

        const tags = new Set<string>();
        data.forEach((p) => p.tags?.forEach((t) => tags.add(t)));
        const payload: FeedCachePayload = {
          posts: data,
          rising,
          tagOptions: [...tags].slice(0, 8),
          likedIds: data.filter((p) => p.liked_by_me).map((p) => p.id),
          collectedIds: data.filter((p) => p.collected_by_me && p.work?.id).map((p) => p.work!.id),
        };
        if (process.env.TARO_ENV === "weapp") {
          console.info("[feed] loaded", payload.posts.length, "posts via", apiSort);
        }
        writePageCache(cacheKey, payload);
        if (gen !== loadGenRef.current) return;
        applyPayload(payload);
        setPostsError(false);
      } catch (err) {
        console.warn("[feed] load failed:", err);
        if (gen !== loadGenRef.current) return;
        if (!readPageCache<FeedCachePayload>(cacheKey, FEED_CACHE_TTL_MS)) {
          setPostsError(true);
        }
      } finally {
        if (gen === loadGenRef.current) {
          setLoading(false);
          Taro.stopPullDownRefresh();
        }
      }
    },
    [applyPayload, cacheKey, sort, tag, d.loadError, loggedIn]
  );

  useEffect(() => {
    void load({ force: true }).finally(() => {
      initialLoadDoneRef.current = true;
    });
  }, [load]);

  useDidShow(() => {
    exitImmersivePlayerLayout();
    const highlight = consumeFeedHighlightPostId();
    if (highlight) {
      setHighlightPostId(highlight);
      setOpenComments((prev) => new Set(prev).add(highlight));
    }
    if (!initialLoadDoneRef.current) return;
    const cached = readPageCache<FeedCachePayload>(cacheKey, FEED_CACHE_TTL_MS);
    void load(cached ? { background: true, force: true } : { force: true });
  });

  useEffect(() => {
    if (!highlightPostId) return;
    const t = setTimeout(() => setHighlightPostId(null), 3200);
    return () => clearTimeout(t);
  }, [highlightPostId]);

  useEffect(() => {
    if (!highlightPostId || process.env.TARO_ENV !== "h5") return;
    const el = document.getElementById(`feed-post-${highlightPostId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightPostId, posts.length]);

  usePullDownRefresh(() => {
    if (feedView === "activity") {
      void loadActivity().finally(() => Taro.stopPullDownRefresh());
      return;
    }
    void load({ force: true }).finally(() => Taro.stopPullDownRefresh());
  });

  const playQueue = useMemo(
    () =>
      posts
        .filter((p) => p.work?.audio_url)
        .map((p) => workToPlayerTrack(p.work!, { artist: p.author_username, source: "feed" })),
    [posts]
  );

  const openTip = useCallback(
    (workId: string) => {
      if (!requireAuth()) return;
      const post = posts.find((p) => p.work?.id === workId);
      setTipTarget({ workId, title: post?.work?.title });
    },
    [posts]
  );

  const loadActivity = useCallback(async () => {
    setActivityLoading(true);
    setActivityError(false);
    try {
      const res = await vibeApi.getActivityStream(activityScope);
      setActivityEvents((res.events || []) as ActivityEvent[]);
    } catch {
      setActivityEvents([]);
      setActivityError(true);
      showError(d.activityLoadFail);
    } finally {
      setActivityLoading(false);
    }
  }, [activityScope, d.activityLoadFail]);

  useEffect(() => {
    if (feedView === "activity") void loadActivity();
  }, [feedView, loadActivity]);

  const toggleLike = useCallback(async (postId: string) => {
    if (!requireAuth()) return;
    const wasLiked = likedIds.has(postId);
    const seq = (likeSeqRef.current.get(postId) ?? 0) + 1;
    likeSeqRef.current.set(postId, seq);
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (wasLiked) next.delete(postId);
      else next.add(postId);
      return next;
    });
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, like_count: Math.max(0, p.like_count + (wasLiked ? -1 : 1)) } : p
      )
    );
    try {
      const res = await vibeApi.likePost(postId);
      if (likeSeqRef.current.get(postId) !== seq) return;
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, like_count: res.like_count } : p)));
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (res.liked) next.add(postId);
        else next.delete(postId);
        return next;
      });
    } catch {
      if (likeSeqRef.current.get(postId) !== seq) return;
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (wasLiked) next.add(postId);
        else next.delete(postId);
        return next;
      });
      void load({ force: true });
      Taro.showToast({ title: d.loadError, icon: "none" });
    }
  }, [likedIds, load, d.loadError]);

  const collect = useCallback(async (workId: string) => {
    if (!requireAuth()) return;
    try {
      const res = await vibeApi.collectWork(workId);
      if (res.collected) {
        setCollectedIds((prev) => new Set(prev).add(workId));
        Taro.showToast({ title: d.collectSuccess, icon: "success" });
      } else {
        setCollectedIds((prev) => {
          const next = new Set(prev);
          next.delete(workId);
          return next;
        });
        Taro.showToast({ title: d.collectRemoved, icon: "none" });
      }
    } catch {
      Taro.showToast({ title: d.loadError, icon: "none" });
    }
  }, [d.collectSuccess, d.collectRemoved, d.loadError]);

  const openRemix = useCallback((workId: string, title?: string) => {
    if (!requireAuth()) return;
    setDerivative({ workId, title: title || copy.pages.discover.title });
  }, [copy.pages.discover.title]);

  const reportPost = useCallback(async (postId: string) => {
    if (!requireAuth()) return;
    try {
      await vibeApi.reportPost(postId, "inappropriate");
      Taro.showToast({ title: d.reportSuccess, icon: "success" });
    } catch {
      Taro.showToast({ title: d.loadError, icon: "none" });
    }
  }, [d.reportSuccess, d.loadError]);

  const toggleComments = useCallback((postId: string) => {
    setOpenComments((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  }, []);

  return (
    <PageShell
      title={copy.pages.discover.title}
      showCredits={false}
      ambient
      tabVariant
      wide
      noPadTop
      hideHeader
    >
      <View className="tab-page feed-page">
        <View className="feed-head">
          <View className="feed-head__row">
            <View className="feed-head__brand">
              <View className="feed-head__icon">
                <Icon name="discover" accent size="sm" />
              </View>
              <Text className="feed-head__title">{copy.pages.discover.title}</Text>
            </View>
            <View className="feed-head__search" onClick={() => openStackPage(STACK_PAGE_ROUTES.search)}>
              <Icon name="search" size="md" />
            </View>
          </View>
        </View>

      {!loggedIn && feedView === "posts" && <AuthBanner message={d.authBanner} loginLabel={d.authBannerAction} />}

      <SegmentedControl
        className="feed-view"
        options={[
          { value: "posts", label: d.feedViewPosts },
          { value: "activity", label: d.feedViewActivity },
        ]}
        value={feedView}
        onChange={(v) => setFeedView(v as "posts" | "activity")}
      />

      {feedView === "activity" && (
        <>
          {!loggedIn && <AuthBanner message={d.activityLoginHint || d.authBanner} loginLabel={d.authBannerAction} />}
          {loggedIn && (
            <SegmentedControl
              className="feed-activity-scope"
              options={[
                { value: "global", label: d.activityScopeGlobal },
                { value: "following", label: d.activityScopeFollowing },
              ]}
              value={activityScope}
              onChange={(v) => setActivityScope(v as "global" | "following")}
            />
          )}
          {loggedIn && activityLoading && <LoadingSkeleton count={4} />}
          {loggedIn && !activityLoading && activityError && (
            <EmptyState
              iconName="feed"
              title={d.activityLoadFail}
              actionLabel={d.retry || "重试"}
              onAction={() => void loadActivity()}
            />
          )}
          {loggedIn && !activityLoading && !activityError && activityEvents.length === 0 && (
            <EmptyState iconName="feed" title={d.activityEmpty} description={d.activityEmptyDesc} />
          )}
          {loggedIn &&
            !activityLoading &&
            !activityError &&
            activityEvents.map((ev, i) => (
              <ActivityFeedItem key={`${ev.type}-${ev.at}-${i}`} event={ev} />
            ))}
        </>
      )}

      {feedView === "posts" && (
        <>
          <SegmentedControl
            className="feed-sort"
            options={[
              { value: "personalized", label: d.sortPersonalized },
              ...(loggedIn ? [{ value: "following" as const, label: d.sortFollowing }] : []),
              { value: "latest", label: d.sortLatest },
              { value: "trending", label: d.sortPopular },
            ]}
            value={sort}
            onChange={setSort}
          />

          {loggedIn && sort === "personalized" && !loading && (
            <View className="feed-personalized-hint">
              <Icon name="sigil" accent size="sm" />
              <Text className="feed-personalized-hint__text">{d.personalizedHint}</Text>
            </View>
          )}

          {tagOptions.length > 0 && (
            <View className="feed-tags">
              <ChipGroup
                options={[{ value: "", label: d.tagAll }, ...tagOptions.map((t) => ({ value: t, label: `#${t}` }))]}
                value={tag}
                onChange={setTag}
              />
            </View>
          )}

          {!loading && risingCreators.length > 0 && <RisingCreatorsRow creators={risingCreators} />}

          <View className="feed-social-links">
            <View className="feed-social-links__item" onClick={() => Taro.navigateTo({ url: socialPage("charts") })}>
              <Icon name="feed" size="sm" accent />
              <Text>{copy.socialUi.chartsEntry}</Text>
            </View>
            <View className="feed-social-links__item" onClick={() => Taro.navigateTo({ url: socialPage("duels") })}>
              <Icon name="remix" size="sm" accent />
              <Text>{copy.socialUi.duelsEntry}</Text>
            </View>
          </View>

          {loggedIn && <DuelsRow />}
          {loggedIn && <MoodRadioRow />}

          {loading && <LoadingSkeleton count={3} />}
          {!loading && postsError && (
            <EmptyState
              iconName="discover"
              title={d.loadError}
              actionLabel={d.retry}
              onAction={() => void load({ force: true })}
            />
          )}
          {!loading && !postsError && posts.length === 0 && (
            <EmptyState
              iconName="discover"
              title={d.emptyTitle}
              description={d.emptyDesc}
              actionLabel={copy.actions.enterStudio}
              onAction={() => Taro.switchTab({ url: "/pages/create/index" })}
            />
          )}

          {posts.map((p) => (
            <FeedPostItem
              key={p.id}
              post={p}
              highlighted={highlightPostId === p.id}
              playQueue={playQueue}
              liked={likedIds.has(p.id)}
              collected={collectedIds.has(p.work?.id || "")}
              commentsOpen={openComments.has(p.id)}
              loggedIn={loggedIn}
              onLike={toggleLike}
              onCollect={collect}
              onRemix={openRemix}
              onReport={reportPost}
              onTip={openTip}
              myUsername={myUsername}
              myUserId={myUserId}
              onCommentToggle={toggleComments}
            />
          ))}
          {derivative && (
            <Suspense fallback={null}>
              <DerivativeSheet
                workId={derivative.workId}
                workTitle={derivative.title}
                onClose={() => setDerivative(null)}
              />
            </Suspense>
          )}
        </>
      )}

      <Suspense fallback={null}>
        <TipSheet
          open={!!tipTarget}
          workId={tipTarget?.workId || ""}
          workTitle={tipTarget?.title}
          onClose={() => setTipTarget(null)}
          onDone={() => feedView === "activity" && void loadActivity()}
        />
      </Suspense>

      <CoachMarks page="feed" />
      </View>
    </PageShell>
  );
}
