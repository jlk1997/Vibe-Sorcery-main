import { View, Text } from "@tarojs/components";
import { Icon } from "../ui";
import "./PlaylistTile.scss";

const GRADIENTS = [
  "linear-gradient(135deg, #d4af6a, rgba(212, 175, 106, 0.35))",
  "linear-gradient(135deg, rgba(212, 175, 106, 0.85), rgba(14, 14, 22, 0.9))",
  "linear-gradient(135deg, rgba(20, 184, 166, 0.55), rgba(5, 5, 8, 0.85))",
  "linear-gradient(135deg, rgba(147, 130, 180, 0.4), #d4af6a)",
];

type Props = {
  title: string;
  trackCount: number;
  trackLabel: string;
  index?: number;
  onClick?: () => void;
};

export function PlaylistTile({ title, trackCount, trackLabel, index = 0, onClick }: Props) {
  const gradient = GRADIENTS[index % GRADIENTS.length];

  return (
    <View className="playlist-tile" onClick={onClick}>
      <View className="playlist-tile__cover" style={{ background: gradient }}>
        <Icon name="journey" size="lg" accent />
        <View className="playlist-tile__count-ring">
          <Text className="playlist-tile__count">{trackCount}</Text>
        </View>
      </View>
      <Text className="playlist-tile__title">{title}</Text>
      <Text className="playlist-tile__meta">{trackLabel}</Text>
    </View>
  );
}
