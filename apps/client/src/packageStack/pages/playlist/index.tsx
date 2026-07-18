import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text } from "@tarojs/components";
import Taro, { useRouter, useShareAppMessage, useDidShow } from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { workToPlayerTrack } from "@vibe-sorcery/types";
import { usePlayer } from "../../../contexts/PlayerProvider";
import { PageShell, SectionLabel } from "../../../components/PageShell";
import { GenerationProgress } from "../../../components/studio/GenerationProgress";
import { PlaylistTrackCard } from "../../../components/community/PlaylistTrackCard";
import { Button, ChipGroup, LoadingSkeleton, Input, ImmersiveCover, StatPill } from "../../../components/ui";
import { vibeApi } from "../../../services/api";
import { bootstrapAuth, requireAuth, isLoggedIn } from "../../../utils/auth";
import { persistActiveGeneration, resolveRestorableJobId } from "../../../utils/restoreGeneration";
import "./index.scss";

export default function PlaylistPage() {
  const { copy } = useLocale();
  const p = copy.playlistUi;
  const router = useRouter();
  const jobId = router.params.jobId;
  const playlistIdParam = router.params.id;
  const { playTrack, queueIndex, queue, isPlaying, currentTrack } = usePlayer();
  const [playlist, setPlaylist] = useState<Awaited<ReturnType<typeof vibeApi.getPlaylist>> | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private" | "unlisted">("private");
  const [generating, setGenerating] = useState(!!jobId);
  const [activeJobId, setActiveJobId] = useState(jobId || "");
  const [jobStartedAt, setJobStartedAt] = useState<string | undefined>();
  const sequentialRef = useRef(false);

  useShareAppMessage(() => {
    if (!playlist) return { title: `${copy.brand.name} · ${copy.pages.journey.title}`, path: "/pages/create/index" };
    return {
      title: playlist.share_text || `${playlist.title}`,
      path: `/pages/playlist/index?id=${playlist.id}`,
    };
  });

  const sorted = useMemo(
    () => (playlist ? [...playlist.tracks].sort((a, b) => a.position - b.position) : []),
    [playlist]
  );

  const playerQueue = useMemo(
    () =>
      sorted
        .filter((t) => t.work?.audio_url)
        .map((t) => workToPlayerTrack({ ...t.work, hls_url: t.work.hls_url }, { source: "playlist" })),
    [sorted]
  );

  useEffect(() => {
    if (!sequentialRef.current || !playlist || isPlaying) return;
    if (currentTrack && queue.length > 0 && queueIndex === queue.length - 1) {
      sequentialRef.current = false;
      vibeApi.trackEvent("playlist_listen_complete", { playlist_id: playlist.id }).catch(() => {});
      Taro.navigateTo({
        url: `/pages/feedback/index?playlistId=${playlist.id}&title=${encodeURIComponent(playlist.title)}`,
      });
    }
  }, [isPlaying, queueIndex, queue.length, currentTrack, playlist]);

  useDidShow(() => {
    if (playlistIdParam || activeJobId) return;
    resolveRestorableJobId().then((restored) => {
      if (!restored || restored.jobType !== "playlist") return;
      setActiveJobId(restored.jobId);
      setJobStartedAt(restored.startedAt);
      setGenerating(true);
    });
  });

  useEffect(() => {
    if (!jobId) return;
    const startedAt = new Date().toISOString();
    setActiveJobId(jobId);
    setJobStartedAt(startedAt);
    persistActiveGeneration({
      jobId,
      returnUrl: `/pages/playlist/index?jobId=${jobId}`,
      startedAt,
      jobType: "playlist",
    });
  }, [jobId]);

  useEffect(() => {
    bootstrapAuth();
    if (!playlistIdParam) return;
    const load = async () => {
      if (isLoggedIn()) {
        try {
          const owned = await vibeApi.getPlaylist(playlistIdParam);
          setIsOwner(true);
          return owned;
        } catch {
          setIsOwner(false);
          return vibeApi.getPublicPlaylist(playlistIdParam);
        }
      }
      setIsOwner(false);
      return vibeApi.getPublicPlaylist(playlistIdParam);
    };
    load()
      .then((pl) => {
        setPlaylist(pl as Awaited<ReturnType<typeof vibeApi.getPlaylist>>);
        setEditTitle(pl.title);
        const vis = (pl as { visibility?: string }).visibility;
        if (vis === "public" || vis === "private" || vis === "unlisted") setVisibility(vis);
        if (!isLoggedIn()) return;
        vibeApi
          .listPlaylistSubscriptions()
          .then((subs) => setSubscribed(subs.some((s) => s.id === pl.id)))
          .catch(() => {});
      })
      .catch(() => Taro.showToast({ title: p.loadFail, icon: "none" }));
  }, [playlistIdParam, p.loadFail]);

  async function saveTitle() {
    if (!playlist || !requireAuth()) return;
    try {
      const updated = await vibeApi.updatePlaylist(playlist.id, { title: editTitle.trim() || playlist.title });
      setPlaylist({ ...playlist, title: updated.title });
      Taro.showToast({ title: p.titleSaved, icon: "success" });
    } catch {
      Taro.showToast({ title: p.publishFail, icon: "none" });
    }
  }

  function startSequential() {
    if (!playerQueue.length) return;
    sequentialRef.current = true;
    playTrack(playerQueue[0], { queue: playerQueue, startIndex: 0, navigate: false });
  }

  async function saveVisibility(next: "public" | "private" | "unlisted") {
    if (!playlist || !requireAuth()) return;
    setVisibility(next);
    try {
      await vibeApi.publishPlaylist(playlist.id, next);
      if (next === "public") {
        vibeApi.trackEvent("playlist_published", { playlist_id: playlist.id }).catch(() => {});
      }
      Taro.showToast({ title: next === "public" ? p.publishSuccess : p.titleSaved, icon: "success" });
    } catch {
      Taro.showToast({ title: p.publishFail, icon: "none" });
    }
  }

  async function publish() {
    await saveVisibility("public");
  }

  async function toggleSubscribe() {
    if (!playlist || !requireAuth() || isOwner) return;
    setSubscribing(true);
    try {
      if (subscribed) {
        await vibeApi.unsubscribePlaylist(playlist.id);
        setSubscribed(false);
      } else {
        await vibeApi.subscribePlaylist(playlist.id);
        setSubscribed(true);
        Taro.showToast({ title: p.subscribeSuccess, icon: "success" });
      }
    } catch {
      Taro.showToast({ title: p.subscribeFail, icon: "none" });
    } finally {
      setSubscribing(false);
    }
  }

  if (generating && activeJobId && !playlist) {
    return (
      <PageShell label={copy.nav.playlists} title={p.generating} wide ambient>
        <GenerationProgress
          jobId={activeJobId}
          showActions
          jobType="playlist"
          startedAt={jobStartedAt}
          returnUrl={`/pages/playlist/index?jobId=${activeJobId}`}
          onComplete={(res) => {
            if (res.playlistId) {
              setGenerating(false);
              vibeApi.getPlaylist(res.playlistId).then(setPlaylist);
            }
          }}
        />
      </PageShell>
    );
  }

  if (!playlist) {
    return (
      <PageShell label={copy.nav.playlists} title={copy.pages.playlists.title} wide ambient>
        <LoadingSkeleton count={4} variant="line" />
        <Text className="typo-meta">{p.loading}</Text>
      </PageShell>
    );
  }

  return (
    <PageShell label={copy.nav.playlists} title={playlist.title} subtitle={playlist.share_text || copy.pages.playlists.description} wide immersive ambient>
      <ImmersiveCover height="200rpx">
        <View className="playlist-hero">
          <StatPill label={p.trackMeta.replace("{n}", String(sorted.length))} variant="accent" />
        </View>
      </ImmersiveCover>
      {isLoggedIn() && isOwner && (
        <View className="playlist-page__edit">
          <Input label={p.editTitle} value={editTitle} onInput={(e) => setEditTitle(e.detail.value)} />
          <Button variant="ghost" size="sm" onClick={saveTitle}>
            {p.saveTitle}
          </Button>
          <Text className="typo-meta">{p.visibilityLabel}</Text>
          <ChipGroup
            options={[
              { value: "public", label: p.visibilityPublic },
              { value: "private", label: p.visibilityPrivate },
              { value: "unlisted", label: p.visibilityUnlisted },
            ]}
            value={visibility}
            onChange={(v) => saveVisibility(v as "public" | "private" | "unlisted")}
          />
        </View>
      )}
      <View className="playlist-page__actions">
        {!isOwner && visibility === "public" && isLoggedIn() && (
          <Button variant="secondary" block loading={subscribing} onClick={() => void toggleSubscribe()}>
            {subscribed ? p.unsubscribe : p.subscribe}
          </Button>
        )}
        <Button variant="primary" block onClick={startSequential}>
          {p.startSequential}
        </Button>
        <Button variant="secondary" openType="share">
          {p.share}
        </Button>
        <Button variant="ghost" onClick={publish}>
          {p.publish}
        </Button>
      </View>

      <SectionLabel>{p.trackList}</SectionLabel>
      {sorted.map((t, idx) => (
        <PlaylistTrackCard
          key={t.work.id}
          index={idx}
          total={sorted.length}
          title={t.work.title}
          stage={t.shift_stage}
          coverUrl={t.work.cover_url}
          hlsReady={!!t.work.hls_url}
          active={currentTrack?.id === t.work.id}
          track={workToPlayerTrack(t.work, { source: "playlist" })}
          queue={playerQueue}
          provenanceLabel={p.provenance}
          onProvenance={() => Taro.navigateTo({ url: `/pages/provenance/index?workId=${t.work.id}` })}
        />
      ))}
    </PageShell>
  );
}
