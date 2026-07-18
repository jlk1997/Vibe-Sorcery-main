import { memo, useState } from "react";
import { View, Text, Image } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useLocale } from "@vibe-sorcery/i18n";
import type { PlayerTrack } from "@vibe-sorcery/types";
import { FollowButton } from "./FollowButton";
import { usePlayerTransport } from "../../contexts/PlayerProvider";
import { extractCoverAccent, getCachedCoverAccent, cacheCoverAccent, useTheme } from "../../contexts/ThemeProvider";
import { capabilities } from "../../platform/capabilities";
import { shareWork } from "../../platform/share";
import { ActionIconBar, OverflowMenu, Icon, CreatorLevelBadge } from "../ui";
import { AiGeneratedBadge } from "../legal/AiGeneratedBadge";
import type { OverflowMenuItem } from "../ui";
import "./WorkCard.scss";

type Props = {
  postId: string;
  authorUsername?: string;
  authorIsFollowing?: boolean;
  authorCreatorLevel?: string;
  remixParentTitle?: string;
  onRemixParentClick?: () => void;
  recommendLabel?: string;
  caption?: string;
  coverUrl?: string;
  moods?: string[];
  likeCount: number;
  liked?: boolean;
  collected?: boolean;
  workId?: string;
  track?: PlayerTrack;
  queue?: PlayerTrack[];
  onLike?: () => void;
  onCollect?: () => void;
  onRemix?: () => void;
  onProvenance?: () => void;
  onReport?: () => void;
  onTip?: () => void;
  isAiGenerated?: boolean;
  onCommentToggle?: () => void;
  commentsOpen?: boolean;
};

export const WorkCard = memo(function WorkCard({
  authorUsername,
  authorIsFollowing,
  authorCreatorLevel,
  caption,
  coverUrl,
  moods,
  likeCount,
  liked,
  collected,
  workId,
  track,
  queue,
  onLike,
  onCollect,
  onRemix,
  onProvenance,
  onReport,
  onTip,
  onCommentToggle,
  commentsOpen,
  isAiGenerated = true,
  remixParentTitle,
  onRemixParentClick,
  recommendLabel,
}: Props) {
  const { copy } = useLocale();
  const a = copy.actions;
  const d = copy.derivative;
  const { playTrack, togglePlay, isPlaying, currentTrackId } = usePlayerTransport();
  const { setMood } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [coverAccent, setCoverAccent] = useState<string | null>(() =>
    workId ? getCachedCoverAccent(workId) : null
  );

  function ensureCoverAccent() {
    if (!coverUrl || !workId || coverAccent) return;
    const cached = getCachedCoverAccent(workId);
    if (cached) {
      setCoverAccent(cached);
      return;
    }
    if (!capabilities.canvasColorPick) return;
    extractCoverAccent(coverUrl).then((accent) => {
      if (!accent) return;
      setCoverAccent(accent);
      cacheCoverAccent(workId, accent);
    });
  }

  const playingThis = track && currentTrackId === track.id && isPlaying;

  function handlePlay() {
    if (!track) return;
    ensureCoverAccent();
    if (playingThis) {
      togglePlay();
      return;
    }
    playTrack(track, { queue, navigate: true });
    if (coverAccent) setMood({ coverAccent });
    else if (workId) {
      const cached = getCachedCoverAccent(workId);
      if (cached) setMood({ coverAccent: cached });
    }
  }

  function handleShare() {
    if (!workId) return;
    shareWork(workId, track?.title || caption || copy.pages.discover.title);
  }

  const overflowItems: OverflowMenuItem[] = [
    workId && onCollect
      ? { id: "collect", icon: collected ? "bookmarkFilled" : "bookmark", label: collected ? a.collected : a.collect, onClick: onCollect }
      : null,
    workId && onRemix ? { id: "remix", icon: "remix", label: d.remix.short, onClick: onRemix } : null,
    workId && onTip ? { id: "tip", icon: "heart", label: copy.ecosystemUi.tipTitle, onClick: onTip } : null,
    workId && onProvenance ? { id: "provenance", icon: "search", label: a.provenance, onClick: onProvenance } : null,
    onReport ? { id: "report", icon: "flag", label: a.report, danger: true, onClick: onReport } : null,
  ].filter(Boolean) as OverflowMenuItem[];

  return (
    <View className="work-card">
      <View className="work-card__hero" onClick={track ? handlePlay : undefined}>
        {coverUrl ? (
          <>
            <Image className="work-card__cover-bg" src={coverUrl} mode="aspectFill" lazyLoad />
            <Image className="work-card__cover" src={coverUrl} mode="aspectFill" lazyLoad />
          </>
        ) : (
          <View className="work-card__cover work-card__cover--fallback" />
        )}
        <View className="work-card__gradient" />
        {track && (
          <View className="work-card__play-overlay">
            <View className={`work-card__play-btn ${playingThis ? "work-card__play-btn--active" : ""}`}>
              <Icon name={playingThis ? "pause" : "play"} size="lg" tone={playingThis ? "dark" : "light"} accent={!playingThis} />
            </View>
          </View>
        )}
      </View>
      <View className="work-card__body">
        <View className="work-card__head">
          {authorUsername && (
            <View className="work-card__author-row">
              <Text
                className="work-card__author"
                onClick={() => Taro.navigateTo({ url: `/pages/user/index?username=${authorUsername}` })}
              >
                @{authorUsername}
              </Text>
              <CreatorLevelBadge level={authorCreatorLevel} compact />
            </View>
          )}
          {authorUsername && <FollowButton username={authorUsername} initialFollowing={authorIsFollowing} />}
        </View>
        <View className="work-card__caption-row">
          <Text className="work-card__caption">{caption || copy.pages.discover.title}</Text>
          {isAiGenerated ? <AiGeneratedBadge compact /> : null}
        </View>
        {recommendLabel ? <Text className="work-card__recommend-badge">✦ {recommendLabel}</Text> : null}
        {remixParentTitle ? (
          <Text className="work-card__remix-badge" onClick={onRemixParentClick}>
            {copy.generation.remixBasedOn.replace("{title}", remixParentTitle)}
          </Text>
        ) : null}
        {moods?.length ? <Text className="work-card__tags">{moods.slice(0, 3).join(" · ")}</Text> : null}
        <ActionIconBar
          items={[
            { id: "like", icon: liked ? "heartFilled" : "heart", count: likeCount, active: liked, accent: liked, onClick: onLike },
            { id: "play", icon: playingThis ? "pause" : "play", primary: true, onClick: handlePlay },
            { id: "comment", icon: "comment", accent: commentsOpen, onClick: onCommentToggle },
            { id: "share", icon: "share", onClick: handleShare },
            { id: "more", icon: "more", onClick: () => setMenuOpen(true) },
          ]}
        />
      </View>
      <OverflowMenu open={menuOpen} title={a.more} items={overflowItems} onClose={() => setMenuOpen(false)} />
    </View>
  );
});

