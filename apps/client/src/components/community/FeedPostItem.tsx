import { memo } from "react";
import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { workToPlayerTrack } from "@vibe-sorcery/types";
import type { PlayerTrack } from "@vibe-sorcery/types";
import { WorkCard } from "./WorkCard";
import { CommentSection } from "./CommentSection";
import { PublicTipsStrip } from "./PublicTipsStrip";
import type { FeedPost } from "../../services/api";
import { canRemixWork } from "../../utils/remixLicense";
import { useLocale } from "@vibe-sorcery/i18n";

function formatRecommendReason(
  code: string | undefined,
  labels: { recommendFollowing: string; recommendMood: string; recommendGenre: string; recommendSimilar: string }
): string | undefined {
  if (!code) return undefined;
  if (code === "following") return labels.recommendFollowing;
  if (code === "similar_taste") return labels.recommendSimilar;
  if (code.startsWith("mood:")) return labels.recommendMood.replace("{tag}", code.slice(5));
  if (code.startsWith("genre:")) return labels.recommendGenre.replace("{tag}", code.slice(6));
  return undefined;
}

type Props = {
  post: FeedPost;
  playQueue: PlayerTrack[];
  liked: boolean;
  collected: boolean;
  commentsOpen: boolean;
  highlighted?: boolean;
  loggedIn: boolean;
  onLike: (postId: string) => void;
  onCollect: (workId: string) => void;
  onRemix: (workId: string, title?: string) => void;
  onReport: (postId: string) => void;
  onTip?: (workId: string) => void;
  onCommentToggle: (postId: string) => void;
  myUsername?: string | null;
  myUserId?: string | null;
};

export const FeedPostItem = memo(function FeedPostItem({
  post: p,
  playQueue,
  liked,
  collected,
  commentsOpen,
  highlighted = false,
  loggedIn,
  onLike,
  onCollect,
  onRemix,
  onReport,
  onTip,
  onCommentToggle,
  myUsername,
  myUserId,
}: Props) {
  const { copy } = useLocale();
  const workId = p.work?.id;
  const track = p.work?.audio_url
    ? workToPlayerTrack(p.work, { artist: p.author_username, source: "feed" })
    : undefined;

  return (
    <View
      className={`feed-post${highlighted ? " feed-post--highlighted" : ""}`}
      id={`feed-post-${p.id}`}
    >
      <WorkCard
        postId={p.id}
        authorUsername={p.author_username}
        authorCreatorLevel={p.author_creator_level}
        authorIsFollowing={p.author_is_following}
        caption={p.caption || p.work?.title}
        coverUrl={p.work?.cover_url}
        moods={p.work?.moods}
        likeCount={p.like_count}
        liked={liked}
        collected={collected}
        workId={workId}
        track={track}
        queue={playQueue}
        onLike={() => onLike(p.id)}
        onCollect={workId ? () => onCollect(workId) : undefined}
        onRemix={
          workId && p.work && canRemixWork(p.work)
            ? () => onRemix(workId, p.work!.title || p.caption)
            : undefined
        }
        onProvenance={workId ? () => Taro.navigateTo({ url: `/pages/provenance/index?workId=${workId}` }) : undefined}
        onReport={() => onReport(p.id)}
        onTip={
          workId && onTip && myUsername && p.author_username !== myUsername
            ? () => onTip(workId)
            : undefined
        }
        onCommentToggle={() => onCommentToggle(p.id)}
        commentsOpen={commentsOpen}
        isAiGenerated={p.work?.is_ai_generated !== false}
        remixParentTitle={p.work?.parent_work_title || undefined}
        recommendLabel={formatRecommendReason(p.recommend_reason, copy.discoverUi)}
        onRemixParentClick={
          p.work?.parent_work_id
            ? () => Taro.navigateTo({ url: `/pages/provenance/index?workId=${p.work!.parent_work_id}` })
            : undefined
        }
      />
      {workId ? <PublicTipsStrip workId={workId} /> : null}
      {loggedIn && commentsOpen && (
        <View className="feed-comments">
          <CommentSection postId={p.id} commentCount={p.comment_count} myUsername={myUsername} myUserId={myUserId} />
        </View>
      )}
    </View>
  );
});
