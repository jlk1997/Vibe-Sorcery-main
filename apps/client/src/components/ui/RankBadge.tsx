import { View, Text, Image } from "@tarojs/components";
import { Icon } from "../ui";
import { clsx } from "../../utils/clsx";
import "./RankBadge.scss";

type Props = {
  rank: number;
  size?: "sm" | "md";
};

export function RankBadge({ rank, size = "md" }: Props) {
  const medal = rank === 1 ? "gold" : rank === 2 ? "silver" : rank === 3 ? "bronze" : null;

  return (
    <View className={clsx("rank-badge", size === "sm" && "rank-badge--sm", medal && `rank-badge--${medal}`)}>
      {medal ? (
        <Text className="rank-badge__medal">{rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉"}</Text>
      ) : (
        <Text className="rank-badge__num">#{rank}</Text>
      )}
    </View>
  );
}
