import { useState } from "react";
import { View, Text } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { workToPlayerTrack } from "@vibe-sorcery/types";
import { PageShell, SectionLabel } from "../../components/PageShell";
import {
  AuthBanner,
  Button,
  EmptyState,
  FeatureCard,
  ImmersiveCover,
  LibraryShelf,
  ListRow,
  LoadingSkeleton,
  MetricCard,
  StatPill,
  CreatorLevelBadge,
  type IconName,
} from "../../components/ui";
import { EngagementPanel } from "../../components/engagement/EngagementPanel";
import { usePlayer } from "../../contexts/PlayerProvider";
import { vibeApi, isUnauthorized } from "../../services/api";
import { bootstrapAuth, clearToken, isLoggedIn } from "../../utils/auth";
import { useCreditsOptional } from "../../contexts/CreditsProvider";
import { setItem } from "../../platform/storage";
import { resolveRestorableJobId } from "../../utils/restoreGeneration";
import { openStackPage } from "../../utils/navigation";
import { STUDIO_PAGE_ROUTES, STACK_PAGE_ROUTES, stackPage } from "../../constants/routes";
import { CoachMarks } from "../../components/onboarding/CoachMarks";
import "./index.scss";

type WorkPreview = { id: string; title: string; cover_url?: string; audio_url: string; moods: string[] };

export default function Profile() {
  const { copy } = useLocale();
  const p = copy.profileUi;
  const w = copy.worksUi;
  const creditsCtx = useCreditsOptional();
  const { playTrack } = usePlayer();
  const [loggedIn, setLoggedIn] = useState(false);
  const [me, setMe] = useState<{ username: string; display_name?: string; avatar_url?: string } | null>(null);
  const [subscription, setSubscription] = useState<{ status: string; monthly_credits: number } | null>(null);
  const [unread, setUnread] = useState(0);
  const [worksCount, setWorksCount] = useState(0);
  const [publishedCount, setPublishedCount] = useState(0);
  const [playlistsCount, setPlaylistsCount] = useState(0);
  const [recentWorks, setRecentWorks] = useState<WorkPreview[]>([]);
  const [activeJob, setActiveJob] = useState<{ jobId: string; returnUrl: string } | null>(null);
  const [creatorLevel, setCreatorLevel] = useState<string | null>(null);
  const [creatorStats, setCreatorStats] = useState<{
    published: number;
    total_likes: number;
    remix_derivatives: number;
    remixes_received: number;
    likes_7d: number;
    followers: number;
  } | null>(null);
  const [weeklySummary, setWeeklySummary] = useState<{ listens: number; tips: number; published: number; remixes: number; duel_mentions?: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const NAV_ITEMS: Array<{ label: string; url: string; icon: IconName; badgeKey?: "unread" }> = [
    { label: p.myWorks, url: STACK_PAGE_ROUTES.works, icon: "music" },
    { label: p.myPlaylists, url: "/pages/library/index", icon: "journey" },
    { label: p.challenges, url: STACK_PAGE_ROUTES.challenges, icon: "remix" },
    { label: p.emotionCalendar, url: STACK_PAGE_ROUTES.emotionCalendar, icon: "journey" },
    { label: p.notifications, url: STACK_PAGE_ROUTES.notifications, icon: "bell", badgeKey: "unread" },
    { label: p.copilot, url: "/packageCopilot/pages/copilot/index", icon: "create" },
    { label: copy.nav.search, url: STACK_PAGE_ROUTES.search, icon: "search" },
    { label: p.settings, url: STACK_PAGE_ROUTES.settings, icon: "profile" },
  ];

  async function refreshUser() {
    bootstrapAuth();
    if (!isLoggedIn()) {
      setLoggedIn(false);
      setRecentWorks([]);
      setActiveJob(null);
      setLoading(false);
      setLoadError(false);
      return;
    }
    setLoggedIn(true);
    setLoading(true);
    setLoadError(false);
    try {
      const [u, sub, notif, profile, works, playlists, feed, restored, progress, stats, weekly] = await Promise.all([
        vibeApi.me(),
        vibeApi.getSubscription(),
        vibeApi.getNotifications().catch(() => ({ unread_count: 0, items: [] })),
        vibeApi.getMyProfile().catch(() => null),
        vibeApi.listWorks().catch(() => []),
        vibeApi.listPlaylists().catch(() => []),
        vibeApi.getFeed("latest").catch(() => []),
        resolveRestorableJobId().catch(() => null),
        vibeApi.getProgress().catch(() => null),
        vibeApi.getCreatorStats().catch(() => null),
        vibeApi.getCreatorWeeklySummary().catch(() => null),
      ]);
      setCreatorLevel(progress?.level ?? null);
      if (stats) {
        setCreatorStats({
          published: stats.published,
          total_likes: stats.total_likes,
          remix_derivatives: stats.remix_derivatives,
          remixes_received: stats.remixes_received,
          likes_7d: stats.likes_7d,
          followers: stats.followers,
        });
      }
      setWeeklySummary(weekly);
      setMe({ ...(profile || u), avatar_url: u.avatar_url });
      setSubscription(sub);
      setUnread(notif.unread_count);
      setWorksCount(works.length);
      setPlaylistsCount(playlists.length);
      const postByWork = new Set<string>();
      feed.forEach((post) => {
        if (post.work?.id && post.author_username === u.username) postByWork.add(post.work.id);
      });
      const published = works.filter(
        (item) => item.visibility === "public" || postByWork.has(item.id)
      ).length;
      setPublishedCount(published);
      setRecentWorks(works.slice(0, 4));
      if (restored) {
        setActiveJob({ jobId: restored.jobId, returnUrl: restored.returnUrl });
      } else {
        setActiveJob(null);
      }
      creditsCtx?.refresh();
    } catch (err) {
      if (isUnauthorized(err)) {
        clearToken();
        setLoggedIn(false);
        setMe(null);
      } else {
        setLoadError(true);
      }
    } finally {
      setLoading(false);
    }
  }

  useDidShow(refreshUser);

  function logout() {
    clearToken();
    setLoggedIn(false);
    setMe(null);
    creditsCtx?.refresh();
  }

  function openWorks(filter?: string) {
    const q = filter ? `?filter=${filter}` : "";
    Taro.navigateTo({ url: stackPage("works", q ? Object.fromEntries(new URLSearchParams(q.slice(1))) : undefined) });
  }

  function openPlaylists() {
    setItem("library:tab", "playlists");
    Taro.switchTab({ url: "/pages/library/index" });
  }

  function playRecentWork(workId: string) {
    const work = recentWorks.find((item) => item.id === workId);
    if (!work?.audio_url) return;
    const tracks = recentWorks
      .filter((item) => item.audio_url)
      .map((item) => workToPlayerTrack(item, { source: "library" }));
    const track = tracks.find((t) => t.id === workId);
    if (track) playTrack(track, { queue: tracks, navigate: true });
  }

  function resumeActiveJob() {
    if (!activeJob) return;
    const url =
      activeJob.returnUrl.includes("playlist") || activeJob.returnUrl.includes("create")
        ? `${activeJob.returnUrl}${activeJob.returnUrl.includes("?") ? "&" : "?"}jobId=${activeJob.jobId}`
        : activeJob.returnUrl;
    if (url.startsWith("/pages/create") || url.startsWith("/pages/playlist")) {
      Taro.navigateTo({ url }).catch(() => Taro.switchTab({ url: activeJob.returnUrl }));
      return;
    }
    Taro.navigateTo({ url: `/pages/create/index` });
  }

  if (!loggedIn) {
    return (
      <PageShell title={p.title} subtitle={copy.brand.tagline} ambient tabVariant noPadTop>
        <ImmersiveCover height="200rpx">
          <Text className="profile-guest__hero-title">{copy.brand.name}</Text>
          <Text className="profile-guest__hero-tag">{copy.brand.tagline}</Text>
        </ImmersiveCover>
        <AuthBanner message={p.authBanner} loginLabel={p.loginButton} />
        <FeatureCard icon="music" title={p.featureCreate} description={p.bullet1} onClick={() => Taro.switchTab({ url: "/pages/create/index" })} />
        <FeatureCard icon="journey" title={p.featureJourney} description={p.bullet2} onClick={() => openStackPage(STUDIO_PAGE_ROUTES.journey)} />
        <FeatureCard icon="feed" title={p.featureCommunity} description={p.bullet3} onClick={() => Taro.switchTab({ url: "/pages/feed/index" })} />
        <Button variant="primary" block className="profile-guest__cta" onClick={() => Taro.navigateTo({ url: STACK_PAGE_ROUTES.login })}>
          {p.loginButton}
        </Button>
        <Button variant="ghost" block onClick={() => Taro.navigateTo({ url: STACK_PAGE_ROUTES.pricing })}>
          {p.viewPricing}
        </Button>
      </PageShell>
    );
  }

  const credits = creditsCtx?.balance ?? 0;
  const shelfItems = recentWorks.map((item) => ({
    id: item.id,
    title: item.title,
    coverUrl: item.cover_url,
  }));

  return (
    <PageShell title={me?.display_name || p.title} subtitle={me ? `@${me.username}` : copy.brand.tagline} showCredits={false} ambient tabVariant noPadTop>
      {loading && !me && <LoadingSkeleton count={3} />}
      {loadError && (
        <EmptyState
          iconName="profile"
          title={copy.worksUi.loadFail}
          actionLabel={copy.discoverUi.retry}
          onAction={() => void refreshUser()}
        />
      )}
      {!loadError && (
      <>
      <ImmersiveCover coverUrl={me?.avatar_url} height="220rpx">
        <View className="profile-hero">
          <View className="profile-hero__avatar-ring">
            <View className="profile-hero__avatar-inner">
              {me?.avatar_url ? (
                <View className="profile-hero__avatar-img" style={{ backgroundImage: `url(${me.avatar_url})` }} />
              ) : (
                <Text className="profile-hero__avatar-fallback">{(me?.display_name || me?.username || "?").slice(0, 1).toUpperCase()}</Text>
              )}
            </View>
          </View>
          {me && <Text className="profile-hero__name">{me.display_name || me.username}</Text>}
          {me && (
            <Text className="profile-hero__link" onClick={() => Taro.navigateTo({ url: stackPage("user", { username: me.username }) })}>
              @{me.username}
            </Text>
          )}
          <CreatorLevelBadge level={creatorLevel} />
        </View>
      </ImmersiveCover>

      <View className="profile-quick">
        {subscription?.status === "active" && (
          <StatPill
            className="ui-stat-pill--member"
            label={p.member.replace("{n}", String(subscription.monthly_credits))}
            variant="accent"
            onClick={() => Taro.navigateTo({ url: STACK_PAGE_ROUTES.pricing })}
          />
        )}
        <StatPill label={`${p.billingHub} · ${credits}`} onClick={() => Taro.navigateTo({ url: STACK_PAGE_ROUTES.pricing })} />
        <StatPill label={p.creditLedger} onClick={() => Taro.navigateTo({ url: stackPage("settings", { section: "credits" }) })} />
        {unread > 0 && <StatPill label={`${p.notifications} ${unread}`} variant="danger" onClick={() => Taro.navigateTo({ url: STACK_PAGE_ROUTES.notifications })} />}
      </View>

      <EngagementPanel />

      {weeklySummary && (weeklySummary.listens > 0 || weeklySummary.tips > 0 || weeklySummary.published > 0 || weeklySummary.remixes > 0) && (
        <View className="profile-weekly-digest" onClick={() => Taro.navigateTo({ url: STACK_PAGE_ROUTES.creatorEarnings })}>
          <View className="profile-weekly-digest__glow" />
          <View className="profile-weekly-digest__body">
            <Text className="profile-weekly-digest__title">{p.weeklyDigest}</Text>
            <Text className="profile-weekly-digest__meta">
              {p.weeklyDigestEngagement
                .replace("{listens}", String(weeklySummary.listens))
                .replace("{tips}", String(weeklySummary.tips))
                .replace("{published}", String(weeklySummary.published))
                .replace("{remix}", String(weeklySummary.remixes))}
            </Text>
            <Text className="profile-weekly-digest__cta">{p.weeklyDigestCta} →</Text>
          </View>
        </View>
      )}

      {creatorStats && (
        <View className="profile-creator-dash">
          <SectionLabel>{p.creatorDashboard}</SectionLabel>
          <View className="profile-vault__metrics">
            <MetricCard icon="feed" value={creatorStats.published} label={p.creatorPublished} />
            <MetricCard icon="heart" value={creatorStats.total_likes} label={p.creatorLikes} variant="info" />
            <MetricCard icon="remix" value={creatorStats.remix_derivatives} label={p.creatorRemixes} />
            <MetricCard icon="music" value={creatorStats.remixes_received} label={p.creatorRemixReceived} variant="info" />
            <MetricCard icon="heart" value={creatorStats.likes_7d} label={p.creatorLikes7d} />
            <MetricCard icon="profile" value={creatorStats.followers} label={p.creatorFollowers} />
          </View>
        </View>
      )}

      {activeJob && (
        <View className="profile-active-job" onClick={resumeActiveJob}>
          <View className="profile-active-job__pulse" />
          <View className="profile-active-job__body">
            <Text className="profile-active-job__label">{p.activeJobTeaser}</Text>
            <Text className="profile-active-job__action">{p.activeJobAction}</Text>
          </View>
        </View>
      )}

      <View className="profile-vault">
        <SectionLabel>{p.vaultTitle}</SectionLabel>
        <View className="profile-vault__metrics">
          <MetricCard icon="music" value={worksCount} label={p.worksStat} onClick={() => openWorks()} />
          <MetricCard icon="feed" value={publishedCount} label={p.publishedStat} variant="info" onClick={() => openWorks("published")} />
          <MetricCard icon="journey" value={playlistsCount} label={p.myPlaylists} variant="warning" onClick={openPlaylists} />
        </View>

        {recentWorks.length > 0 ? (
          <View className="profile-vault__recent">
            <View className="profile-vault__recent-head">
              <Text className="profile-vault__recent-title">{p.recentWorks}</Text>
              <Text className="profile-vault__view-all" onClick={() => openWorks()}>
                {w.viewAll} →
              </Text>
            </View>
            <LibraryShelf label="" items={shelfItems} onSelect={playRecentWork} />
          </View>
        ) : (
          <View className="profile-vault__empty">
            <Text className="profile-vault__empty-text">{w.emptyDesc}</Text>
            <Button variant="secondary" size="sm" onClick={() => Taro.switchTab({ url: "/pages/create/index" })}>
              {p.emptyWorksCta}
            </Button>
          </View>
        )}
      </View>

      <View className="profile-menu">
        {NAV_ITEMS.map((item) => (
          <ListRow
            key={item.url}
            icon={item.icon}
            label={item.label}
            badge={item.badgeKey === "unread" ? unread : undefined}
            onClick={() => {
              if (item.url === "/pages/library/index") {
                openPlaylists();
                return;
              }
              Taro.navigateTo({ url: item.url });
            }}
          />
        ))}
      </View>

      <Button variant="ghost" block onClick={logout} className="profile-logout">
        {p.logout}
      </Button>
      </>
      )}
      <CoachMarks page="profile" />
    </PageShell>
  );
}
