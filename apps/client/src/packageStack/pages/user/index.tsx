import { useEffect, useMemo, useState } from "react";
import { View } from "@tarojs/components";
import Taro, { useRouter, useShareAppMessage } from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { workToPlayerTrack } from "@vibe-sorcery/types";
import { PageShell } from "../../../components/PageShell";
import { WorkRow } from "../../../components/community/WorkRow";
import { WorkCoverCard } from "../../../components/community/WorkCoverCard";
import { WorkCard } from "../../../components/community/WorkCard";
import { FollowButton } from "../../../components/community/FollowButton";
import { Avatar, ChipGroup, EmptyState, ImmersiveCover, LoadingSkeleton, MetricCard, ViewModeToggle, Button, showError, showSuccess } from "../../../components/ui";
import { vibeApi, type FeedPost } from "../../../services/api";
import { workSharePayload } from "../../../platform/share";
import { stackPage } from "../../../constants/routes";
import { bootstrapAuth, requireAuth } from "../../../utils/auth";
import { useCreditsOptional } from "../../../contexts/CreditsProvider";
import "./index.scss";

type WorkPack = { id: string; title: string; price_credits: number; work_count: number };

type Tab = "works" | "posts" | "followers" | "following";
type ViewMode = "grid" | "list";

export default function UserPage() {
  const router = useRouter();
  const { copy } = useLocale();
  const u = copy.userUi;
  const m = copy.marketplaceUi;
  const creditsCtx = useCreditsOptional();
  const w = copy.worksUi;
  const username = router.params.username || "";

  useShareAppMessage((res) => {
    const ds = (res?.target as { dataset?: Record<string, string> } | undefined)?.dataset;
    if (ds?.workid) return workSharePayload(ds.workid, ds.title || copy.brand.name);
    return { title: `@${username}`, path: stackPage("user", { username }) };
  });
  const [profile, setProfile] = useState<{
    username: string;
    display_name?: string;
    bio?: string;
    avatar_url?: string;
    stats?: { works: number; followers: number; following: number };
  } | null>(null);
  const [works, setWorks] = useState<Array<{ id: string; title: string; audio_url: string; cover_url?: string; hls_url?: string; moods?: string[] }>>([]);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [tab, setTab] = useState<Tab>("works");
  const [view, setView] = useState<ViewMode>("grid");
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [socialList, setSocialList] = useState<Array<{ username: string; display_name?: string; avatar_url?: string }>>([]);
  const [loadingSocial, setLoadingSocial] = useState(false);
  const [workPacks, setWorkPacks] = useState<WorkPack[]>([]);
  const [buyingPack, setBuyingPack] = useState<string | null>(null);

  useEffect(() => {
    if (!username) return;
    vibeApi.getUserProfile(username).then(setProfile).catch(() => {});
    vibeApi.getUserWorks(username).then(setWorks).catch(() => {});
    vibeApi.listUserWorkPacks(username).then(setWorkPacks).catch(() => setWorkPacks([]));
  }, [username]);

  useEffect(() => {
    if (!username || tab !== "posts") return;
    setLoadingPosts(true);
    vibeApi
      .getUserPosts(username)
      .then(setPosts)
      .catch(() => setPosts([]))
      .finally(() => setLoadingPosts(false));
  }, [username, tab]);

  useEffect(() => {
    if (!username || (tab !== "followers" && tab !== "following")) return;
    setLoadingSocial(true);
    const loader = tab === "followers" ? vibeApi.getUserFollowers : vibeApi.getUserFollowing;
    loader(username)
      .then(setSocialList)
      .catch(() => setSocialList([]))
      .finally(() => setLoadingSocial(false));
  }, [username, tab]);

  const worksQueue = useMemo(() => works.map((w) => workToPlayerTrack(w, { artist: username, source: "user" })), [works, username]);

  const postsQueue = useMemo(
    () =>
      posts
        .filter((p) => p.work?.audio_url)
        .map((p) => workToPlayerTrack(p.work!, { artist: username, source: "user" })),
    [posts, username]
  );

  const pageTitle = profile?.display_name || (profile ? `@${profile.username}` : u.pageTitleFallback);

  async function buyPack(packId: string) {
    if (!requireAuth()) return;
    setBuyingPack(packId);
    try {
      await vibeApi.purchaseWorkPack(packId);
      await creditsCtx?.refresh();
      showSuccess(m.purchaseSuccess);
    } catch {
      showError(m.purchaseFail);
    } finally {
      setBuyingPack(null);
    }
  }

  return (
    <PageShell title={pageTitle} subtitle={profile?.bio} wide immersive ambient>
      {username && (
        <ImmersiveCover coverUrl={profile?.avatar_url || works[0]?.cover_url} height="280rpx">
          <View className="user-hero">
            <Avatar name={profile?.display_name || username} src={profile?.avatar_url} size="lg" />
            {profile?.stats && (
              <View className="user-metrics">
                <MetricCard icon="music" value={profile.stats.works} label={u.statWorks} variant="accent" />
                <MetricCard icon="profile" value={profile.stats.followers} label={u.statFollowers} variant="info" />
                <MetricCard icon="heart" value={profile.stats.following} label={u.statFollowing} variant="warm" />
              </View>
            )}
            <FollowButton username={username} />
          </View>
        </ImmersiveCover>
      )}

      <View className="user-tabs">
        <ChipGroup
          options={[
            { value: "works", label: u.tabWorks },
            { value: "posts", label: u.tabPosts },
            { value: "followers", label: u.statFollowers },
            { value: "following", label: u.statFollowing },
          ]}
          value={tab}
          onChange={(v) => setTab(v as Tab)}
        />
        {tab === "works" && works.length > 0 && (
          <ViewModeToggle
            options={[
              { value: "grid", icon: "grid", label: w.viewGrid },
              { value: "list", icon: "list", label: w.viewList },
            ]}
            value={view}
            onChange={(v) => setView(v as ViewMode)}
          />
        )}
      </View>

      {tab === "works" && (
        <>
          {workPacks.length > 0 && (
            <View className="user-store">
              <Text className="user-store__title">{u.creatorStore}</Text>
              {workPacks.map((pack) => (
                <View key={pack.id} className="user-store__card">
                  <Text className="user-store__name">{pack.title}</Text>
                  <Text className="typo-meta">{m.packWorks.replace("{n}", String(pack.work_count))}</Text>
                  <View className="user-store__row">
                    <Text className="user-store__price">{m.priceCredits.replace("{n}", String(pack.price_credits))}</Text>
                    <Button size="sm" variant="secondary" loading={buyingPack === pack.id} onClick={() => void buyPack(pack.id)}>
                      {u.storeBuy}
                    </Button>
                  </View>
                </View>
              ))}
            </View>
          )}
          {works.length === 0 && <EmptyState iconName="music" title={u.emptyWorks} />}
          {view === "grid" ? (
            <View className="user-works-grid">
              {works.map((item) => (
                <View key={item.id} className="user-works-grid__cell">
                  <WorkCoverCard
                    id={item.id}
                    title={item.title}
                    moods={item.moods}
                    coverUrl={item.cover_url}
                    hlsReady={!!item.hls_url}
                    track={workToPlayerTrack(item, { artist: username, source: "user" })}
                    queue={worksQueue}
                  />
                </View>
              ))}
            </View>
          ) : (
            works.map((item) => (
              <WorkRow
                key={item.id}
                id={item.id}
                title={item.title}
                moods={item.moods}
                coverUrl={item.cover_url}
                hlsReady={!!item.hls_url}
                track={workToPlayerTrack(item, { artist: username, source: "user" })}
                queue={worksQueue}
              />
            ))
          )}
        </>
      )}

      {tab === "posts" && (
        <>
          {loadingPosts && <LoadingSkeleton count={3} />}
          {!loadingPosts && posts.length === 0 && (
            <EmptyState iconName="feed" title={u.emptyPosts} description={u.postsComingDesc} />
          )}
          {posts.map((p) => (
            <WorkCard
              key={p.id}
              postId={p.id}
              authorUsername={p.author_username || username}
              caption={p.caption}
              coverUrl={p.work?.cover_url}
              moods={p.work?.moods}
              likeCount={p.like_count}
              workId={p.work?.id}
              track={p.work ? workToPlayerTrack(p.work, { artist: username, source: "user" }) : undefined}
              queue={postsQueue}
              onProvenance={() => p.work?.id && Taro.navigateTo({ url: `/pages/provenance/index?workId=${p.work.id}` })}
            />
          ))}
        </>
      )}

      {(tab === "followers" || tab === "following") && (
        <>
          {loadingSocial && <LoadingSkeleton count={3} />}
          {!loadingSocial && socialList.length === 0 && (
            <EmptyState iconName="profile" title={tab === "followers" ? u.emptyFollowers || u.emptyWorks : u.emptyFollowing || u.emptyWorks} />
          )}
          {socialList.map((person) => (
            <View
              key={person.username}
              className="user-social-row"
              onClick={() => Taro.navigateTo({ url: `/pages/user/index?username=${person.username}` })}
            >
              <Avatar name={person.display_name || person.username} src={person.avatar_url} size="md" />
              <View className="user-social-row__meta">
                <Text className="user-social-row__name">{person.display_name || person.username}</Text>
                <Text className="user-social-row__handle">@{person.username}</Text>
              </View>
            </View>
          ))}
        </>
      )}
    </PageShell>
  );
}
