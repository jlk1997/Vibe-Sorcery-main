import { View, Text } from "@tarojs/components";
import { clsx } from "../../utils/clsx";
import "./PlayerLyricPanel.scss";

type Props = {
  lines: string[];
  activeIndex: number;
  emptyHint: string;
  className?: string;
};

/** 网易云风格歌词/情绪滚动面板 */
export function PlayerLyricPanel({ lines, activeIndex, emptyHint, className }: Props) {
  if (lines.length === 0) {
    return (
      <View className={clsx("player-lyric", className)}>
        <Text className="player-lyric__empty">{emptyHint}</Text>
      </View>
    );
  }

  return (
    <View className={clsx("player-lyric", className)}>
      <View className="player-lyric__scroll">
        {lines.map((line, i) => (
          <Text
            key={`${i}-${line}`}
            className={clsx(
              "player-lyric__line",
              i === activeIndex && "player-lyric__line--active",
              i < activeIndex && "player-lyric__line--past"
            )}
          >
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
}
