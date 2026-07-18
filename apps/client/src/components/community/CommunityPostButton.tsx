import { View, Text } from "@tarojs/components";
import { useLocale } from "@vibe-sorcery/i18n";
import { Icon } from "../ui";
import { openCommunityPost } from "../../utils/communityNav";
import { clsx } from "../../utils/clsx";
import "./CommunityPostButton.scss";

type Props = {
  postId?: string | null;
  published?: boolean;
  onPublish?: () => void;
  block?: boolean;
  size?: "sm" | "md";
  className?: string;
};

export function CommunityPostButton({
  postId,
  published,
  onPublish,
  block,
  size = "md",
  className,
}: Props) {
  const { copy } = useLocale();
  const w = copy.worksUi;

  if (published && postId) {
    return (
      <View
        className={clsx(
          "community-post-btn",
          "community-post-btn--view",
          block && "community-post-btn--block",
          size === "sm" && "community-post-btn--sm",
          className,
        )}
        onClick={(e) => {
          e.stopPropagation();
          openCommunityPost(postId);
        }}
      >
        <Icon name="feed" size="sm" accent />
        <Text className="community-post-btn__text">{w.viewInCommunity}</Text>
      </View>
    );
  }

  if (!onPublish) return null;

  return (
    <View
      className={clsx(
        "community-post-btn",
        "community-post-btn--publish",
        block && "community-post-btn--block",
        size === "sm" && "community-post-btn--sm",
        className,
      )}
      onClick={(e) => {
        e.stopPropagation();
        onPublish();
      }}
    >
      <Icon name="feed" size="sm" />
      <Text className="community-post-btn__text">{w.publishToCommunity}</Text>
    </View>
  );
}
