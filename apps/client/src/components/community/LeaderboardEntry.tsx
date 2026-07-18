import { View, Text, Image } from "@tarojs/components";
import type { PlayerTrack } from "@vibe-sorcery/types";
import { PlayTrackButton } from "../player/PlayTrackButton";
import { Icon, RankBadge } from "../ui";
import "./LeaderboardEntry.scss";

type Props = {
  rank: number;
  title: string;
  author?: string;
  coverUrl?: string;
  likeCount?: number;
  likesLabel?: string;
  track?: PlayerTrack;
  queue?: PlayerTrack[];
  onClick?: () => void;
};

export function LeaderboardEntry({ rank, title, author, coverUrl, likeCount, likesLabel, track, queue, onClick }: Props) {
  return (
    <View className="leaderboard-entry" onClick={onClick}>
      <RankBadge rank={rank} />
      {coverUrl ? (
        <Image className="leaderboard-entry__cover" src={coverUrl} mode="aspectFill" />
      ) : (
        <View className="leaderboard-entry__cover leaderboard-entry__cover--fallback">
          <Icon name="music" accent />
        </View>
      )}
      <View className="leaderboard-entry__info">
        <Text className="leaderboard-entry__title">{title}</Text>
        {author && <Text className="leaderboard-entry__author">@{author}</Text>}
        {likeCount != null && likeCount > 0 && (
          <View className="leaderboard-entry__likes">
            <Icon name="heartFilled" size="sm" />
            <Text>{likeCount} {likesLabel}</Text>
          </View>
        )}
      </View>
      {track && (
        <View className="leaderboard-entry__play" onClick={(e) => e.stopPropagation()}>
          <PlayTrackButton track={track} queue={queue} />
        </View>
      )}
    </View>
  );
}
