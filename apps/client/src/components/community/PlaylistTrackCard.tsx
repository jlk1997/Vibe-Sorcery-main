import { View, Text, Image } from "@tarojs/components";
import type { PlayerTrack } from "@vibe-sorcery/types";
import { PlayTrackButton } from "../player/PlayTrackButton";
import { Badge, Icon, ProgressRail } from "../ui";
import { clsx } from "../../utils/clsx";
import "./PlaylistTrackCard.scss";

type Props = {
  index: number;
  total: number;
  title: string;
  stage?: string;
  coverUrl?: string;
  hlsReady?: boolean;
  active?: boolean;
  track?: PlayerTrack;
  queue?: PlayerTrack[];
  onProvenance?: () => void;
  provenanceLabel?: string;
};

export function PlaylistTrackCard({
  index,
  total,
  title,
  stage,
  coverUrl,
  hlsReady,
  active,
  track,
  queue,
  onProvenance,
  provenanceLabel,
}: Props) {
  const pct = total > 1 ? ((index + 1) / total) * 100 : 100;

  return (
    <View className={clsx("playlist-track-card", active && "playlist-track-card--active")}>
      <View className="playlist-track-card__main">
        <View className="playlist-track-card__step-badge">
          <Text className="playlist-track-card__num">{index + 1}</Text>
        </View>
        {coverUrl ? (
          <Image className="playlist-track-card__cover" src={coverUrl} mode="aspectFill" />
        ) : (
          <View className="playlist-track-card__cover playlist-track-card__cover--fallback">
            <Icon name="music" accent />
          </View>
        )}
        <View className="playlist-track-card__body">
          <Text className="playlist-track-card__stage">{stage || `#${index + 1}`}</Text>
          <Text className="playlist-track-card__title">{title}</Text>
          {hlsReady && <Badge tone="success">HLS</Badge>}
        </View>
        <View className="playlist-track-card__actions">
          {track && <PlayTrackButton track={track} queue={queue} label={`#${index + 1}`} />}
          {onProvenance && provenanceLabel && (
            <Text className="playlist-track-card__link" onClick={onProvenance}>
              {provenanceLabel}
            </Text>
          )}
        </View>
      </View>
      <ProgressRail pct={pct} className="playlist-track-card__progress" />
    </View>
  );
}
