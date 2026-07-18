import { View, Text, Image } from "@tarojs/components";
import { Icon } from "../ui";
import "./PostSnippetCard.scss";

type Props = {
  caption?: string;
  coverUrl?: string;
  fallbackTitle?: string;
  onClick?: () => void;
};

export function PostSnippetCard({ caption, coverUrl, fallbackTitle, onClick }: Props) {
  return (
    <View className="post-snippet" onClick={onClick}>
      {coverUrl ? (
        <Image className="post-snippet__cover" src={coverUrl} mode="aspectFill" />
      ) : (
        <View className="post-snippet__cover post-snippet__cover--fallback">
          <Icon name="feed" accent />
        </View>
      )}
      <View className="post-snippet__body">
        <Text className="post-snippet__caption">{caption || fallbackTitle}</Text>
        <View className="post-snippet__hint">
          <Icon name="comment" size="sm" />
          <Text className="post-snippet__hint-text">Post</Text>
        </View>
      </View>
    </View>
  );
}
