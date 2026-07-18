import { View, Text } from "@tarojs/components";
import { Avatar } from "../ui/Avatar";
import "./CreatorChip.scss";

type Props = {
  username: string;
  displayName?: string;
  onClick?: () => void;
};

export function CreatorChip({ username, displayName, onClick }: Props) {
  return (
    <View className="creator-chip" onClick={onClick}>
      <Avatar name={displayName || username} size="md" />
      <View className="creator-chip__text">
        <Text className="creator-chip__name">{displayName || username}</Text>
        <Text className="creator-chip__handle">@{username}</Text>
      </View>
    </View>
  );
}
