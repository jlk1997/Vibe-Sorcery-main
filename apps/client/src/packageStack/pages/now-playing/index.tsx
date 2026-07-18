import { useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { View, Text, Image } from "@tarojs/components";
import Taro, { useDidHide, useDidShow, useShareAppMessage } from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import { moodAccent } from "@vibe-sorcery/types";
import { usePageTitle } from "../../../hooks/usePageTitle";
import { useRouteTick } from "../../../hooks/useRouteTick";
import { usePlayer } from "../../../contexts/PlayerProvider";
import { AmbientBackdrop } from "../../../components/player/AmbientBackdrop";
import { NetEaseDisc } from "../../../components/player/NetEaseDisc";
import { AiGeneratedBadge } from "../../../components/legal/AiGeneratedBadge";
import { PlayerLyricPanel } from "../../../components/player/PlayerLyricPanel";
import { PlayerScrubber } from "../../../components/player/PlayerScrubber";
import { BottomSheet, Icon, ShareButton } from "../../../components/ui";
import { shareWork, workSharePayload } from "../../../platform/share";
import { vibeApi } from "../../../services/api";
import { currentPageRoute, isImmersiveRoute } from "../../../constants/routes";
import { enterImmersivePlayerLayout, exitImmersivePlayerLayout } from "../../../platform/layout";
import { bootstrapAuth, isLoggedIn, requireAuth } from "../../../utils/auth";
import { openCommunityPost } from "../../../utils/communityNav";
import { useWorkPostStatus } from "../../../hooks/useWorkPostStatus";
import { syncAfterFeedMutation } from "../../../utils/feedMutationSync";
import { useCreditsOptional } from "../../../contexts/CreditsProvider";
import { showSuccess } from "../../../components/ui";
import { clsx } from "../../../utils/clsx";
import "./index.scss";

const LazyPublishDialog = lazy(() =>
  import("../../../components/community/PublishDialog").then((m) => ({ default: m.PublishDialog }))
);

function formatTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type Panel = "disc" | "lyric";

export default function NowPlayingPage() {
  const { copy } = useLocale();
  const pl = copy.player;
  usePageTitle(copy.navTitles.nowPlaying);
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    togglePlay,
    seek,
    playNext,
    playPrevious,
    hasNext,
    hasPrevious,
    playTrack,
    queue,
    queueIndex,
  } = usePlayer();
  const [seeking, setSeeking] = useState(currentTime);
  const [queueOpen, setQueueOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>("disc");
  const [collected, setCollected] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [lyricTimeline, setLyricTimeline] = useState<Array<{ time: number; text: string }>>([]);
  const [pageActive, setPageActive] = useState(true);
  const creditsCtx = useCreditsOptional();
  const { postId, setPostId } = useWorkPostStatus(currentTrack?.id);

  useShareAppMessage(() =>
    currentTrack?.id
      ? workSharePayload(currentTrack.id, currentTrack.title)
      : { title: copy.brand.name }
  );
  const swipeStartX = useRef(0);
  const routeTick = useRouteTick();
  const onThisPage = useMemo(() => isImmersiveRoute(currentPageRoute()), [routeTick]);

  const accent = moodAccent(currentTrack?.moods);
  const accentGlow = `${accent}66`;

  function dismissPlayer() {
    setPageActive(false);
    exitImmersivePlayerLayout();
    Taro.navigateBack().catch(() => Taro.switchTab({ url: "/pages/feed/index" }));
  }

  useEffect(() => {
    setSeeking(currentTime);
  }, [currentTime]);

  useDidShow(() => {
    if (!isImmersiveRoute(currentPageRoute())) return;
    setPageActive(true);
    enterImmersivePlayerLayout();
  });

  useDidHide(() => {
    setPageActive(false);
    exitImmersivePlayerLayout();
  });

  // H5: useDidHide may not fire on navigateBack / tab switch — follow router instead.
  useEffect(() => {
    if (onThisPage) return;
    setPageActive(false);
    exitImmersivePlayerLayout();
  }, [onThisPage]);

  useEffect(() => () => exitImmersivePlayerLayout(), []);

  useEffect(() => {
    if (!pageActive || !onThisPage || currentTrack) return;
    Taro.navigateBack().catch(() => Taro.switchTab({ url: "/pages/feed/index" }));
  }, [currentTrack, pageActive, onThisPage]);

  useEffect(() => {
    bootstrapAuth();
    if (!currentTrack?.id || !isLoggedIn()) {
      setCollected(false);
      setLyricTimeline([]);
      return;
    }
    vibeApi
      .listCollections()
      .then((items) => setCollected(items.some((i) => i.work.id === currentTrack.id)))
      .catch(() => setCollected(false));
    vibeApi
      .getWork(currentTrack.id)
      .then((work) => setLyricTimeline(work.lyrics_timeline || []))
      .catch(() => setLyricTimeline([]));
  }, [currentTrack?.id]);

  const lyricLines = useMemo(() => {
    if (lyricTimeline.length > 0) return lyricTimeline.map((row) => row.text);
    if (!currentTrack) return [];
    const lines: string[] = [];
    if (currentTrack.moods?.length) lines.push(...currentTrack.moods);
    if (currentTrack.artist) lines.push(`— ${currentTrack.artist}`);
    lines.push(currentTrack.title);
    return lines.length > 1 ? lines : [currentTrack.title, pl.lyricHint];
  }, [currentTrack, pl.lyricHint, lyricTimeline]);

  const activeLyricIndex = useMemo(() => {
    if (!duration || lyricLines.length === 0) return 0;
    if (lyricTimeline.length > 0) {
      let idx = 0;
      for (let i = 0; i < lyricTimeline.length; i++) {
        if (currentTime >= lyricTimeline[i].time) idx = i;
        else break;
      }
      return idx;
    }
    const pct = currentTime / duration;
    return Math.min(lyricLines.length - 1, Math.floor(pct * lyricLines.length));
  }, [currentTime, duration, lyricLines.length, lyricTimeline]);

  async function publishWork(caption: string, opts: { allowRemix: boolean; license: string }) {
    if (!currentTrack?.id || !requireAuth()) return;
    const post = await vibeApi.createPost(currentTrack.id, caption, {
      allow_remix: opts.allowRemix,
      license: opts.license,
      content_compliance_acknowledged: true,
    });
    setPostId(post.id || null);
    await syncAfterFeedMutation(creditsCtx, post);
    showSuccess(copy.worksUi.publishSuccess);
    setPublishOpen(false);
  }

  async function toggleCollect() {
    if (!currentTrack?.id || !requireAuth()) return;
    try {
      const res = await vibeApi.collectWork(currentTrack.id);
      setCollected(res.collected);
      Taro.showToast({
        title: res.collected ? copy.discoverUi.collectSuccess : copy.discoverUi.collectRemoved,
        icon: res.collected ? "success" : "none",
      });
    } catch {
      Taro.showToast({ title: copy.discoverUi.loadError, icon: "none" });
    }
  }

  if (!onThisPage || !pageActive || !currentTrack) return null;

  const pageStyle = {
    "--player-accent": accent,
    "--player-accent-glow": accentGlow,
  } as Record<string, string>;

  return (
    <View className={clsx("now-playing", isPlaying && "now-playing--playing")} style={pageStyle}>
      <AmbientBackdrop active={isPlaying} coverUrl={currentTrack.coverUrl || undefined} accentColor={accent} variant="netease" />

      <View className="now-playing__header">
        <View className="now-playing__minimize" onClick={dismissPlayer}>
          <Icon name="chevronDown" size="lg" />
        </View>
        <View className="now-playing__header-meta">
          <View className="now-playing__header-title-row">
            <Text className="now-playing__header-title">{currentTrack.title}</Text>
            <AiGeneratedBadge compact />
          </View>
          {currentTrack.artist && <Text className="now-playing__header-artist">{currentTrack.artist}</Text>}
        </View>
        <ShareButton
          className="now-playing__header-action"
          onShare={() => currentTrack.id && shareWork(currentTrack.id, currentTrack.title)}
        >
          <Icon name="share" />
        </ShareButton>
      </View>

      <View
        className="now-playing__stage"
        onTouchStart={(e) => {
          swipeStartX.current = e.touches[0]?.clientX ?? 0;
        }}
        onTouchEnd={(e) => {
          const endX = e.changedTouches[0]?.clientX ?? 0;
          const delta = endX - swipeStartX.current;
          if (Math.abs(delta) < 48) return;
          if (delta < 0 && panel === "disc") setPanel("lyric");
          if (delta > 0 && panel === "lyric") setPanel("disc");
        }}
      >
        {panel === "disc" ? (
          <NetEaseDisc coverUrl={currentTrack.coverUrl || undefined} playing={isPlaying} />
        ) : (
          <PlayerLyricPanel lines={lyricLines} activeIndex={activeLyricIndex} emptyHint={pl.lyricHint} />
        )}
      </View>

      <View className="now-playing__mode-dots">
        <View className={clsx("now-playing__dot", panel === "disc" && "now-playing__dot--active")} onClick={() => setPanel("disc")} />
        <View className={clsx("now-playing__dot", panel === "lyric" && "now-playing__dot--active")} onClick={() => setPanel("lyric")} />
      </View>

      <View className="now-playing__actions">
        <View className="now-playing__action" onClick={toggleCollect}>
          <Icon name={collected ? "heartFilled" : "heart"} accent={collected} size="lg" />
        </View>
        {isLoggedIn() && currentTrack.id && (
          <View
            className="now-playing__action"
            onClick={() => {
              if (postId) openCommunityPost(postId);
              else setPublishOpen(true);
            }}
          >
            <Icon name="feed" accent={!!postId} size="lg" />
          </View>
        )}
        <View
          className="now-playing__action"
          onClick={() => currentTrack.id && Taro.navigateTo({ url: `/pages/provenance/index?workId=${currentTrack.id}` })}
        >
          <Icon name="info" size="lg" />
        </View>
        <ShareButton className="now-playing__action" onShare={() => currentTrack.id && shareWork(currentTrack.id, currentTrack.title)}>
          <Icon name="share" size="lg" />
        </ShareButton>
        <View className="now-playing__action" onClick={() => setPanel(panel === "disc" ? "lyric" : "disc")}>
          <Icon name="lyrics" accent={panel === "lyric"} size="lg" />
        </View>
      </View>

      <View className="now-playing__footer">
        <PlayerScrubber
          current={currentTime}
          duration={duration}
          seeking={seeking}
          onSeeking={setSeeking}
          onSeek={seek}
          formatTime={formatTime}
        />

        <View className="now-playing__controls">
          <View
            className={clsx("now-playing__ctrl now-playing__ctrl--side", queue.length <= 1 && "now-playing__ctrl--disabled")}
            onClick={queue.length > 1 ? () => setQueueOpen(true) : undefined}
          >
            <Icon name="queue" accent={queue.length > 1} />
          </View>
          <View className={clsx("now-playing__ctrl", !hasPrevious && "now-playing__ctrl--disabled")} onClick={hasPrevious ? playPrevious : undefined}>
            <Icon name="prev" accent={hasPrevious} size="lg" />
          </View>
          <View className={clsx("now-playing__play", isPlaying && "now-playing__play--active")} onClick={togglePlay}>
            <Icon name={isPlaying ? "pause" : "play"} size="xl" tone="dark" className="now-playing__play-icon" />
          </View>
          <View className={clsx("now-playing__ctrl", !hasNext && "now-playing__ctrl--disabled")} onClick={hasNext ? playNext : undefined}>
            <Icon name="next" accent={hasNext} size="lg" />
          </View>
          <View className="now-playing__ctrl now-playing__ctrl--side" onClick={() => setPanel(panel === "disc" ? "lyric" : "disc")}>
            <Icon name="lyrics" accent={panel === "lyric"} />
          </View>
        </View>
      </View>

      <BottomSheet open={queueOpen} title={pl.queueTitle} onClose={() => setQueueOpen(false)}>
        {queue.map((t, i) => (
          <View
            key={t.id}
            className={clsx("now-playing__queue-row", i === queueIndex && "now-playing__queue-row--active")}
            onClick={() => {
              playTrack(t, { queue, startIndex: i, navigate: false });
              setQueueOpen(false);
            }}
          >
            <Text className="now-playing__queue-index">{i + 1}</Text>
            {t.coverUrl ? (
              <Image className="now-playing__queue-cover" src={t.coverUrl} mode="aspectFill" />
            ) : (
              <View className="now-playing__queue-cover now-playing__queue-cover--fallback" />
            )}
            <View className="now-playing__queue-info">
              <Text className="now-playing__queue-title">{t.title}</Text>
              {t.artist && <Text className="now-playing__queue-artist">{t.artist}</Text>}
            </View>
            {i === queueIndex && isPlaying && <View className="now-playing__queue-playing" />}
          </View>
        ))}
      </BottomSheet>

      {publishOpen && currentTrack && (
        <Suspense fallback={null}>
          <LazyPublishDialog
            workTitle={currentTrack.title}
            onClose={() => setPublishOpen(false)}
            onPublish={publishWork}
          />
        </Suspense>
      )}
    </View>
  );
}
