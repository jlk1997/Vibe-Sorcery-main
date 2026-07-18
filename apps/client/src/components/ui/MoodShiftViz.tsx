import { View, Text } from "@tarojs/components";
import { clsx } from "../../utils/clsx";
import "./MoodShiftViz.scss";

type Props = {
  before: number;
  after: number;
  labels: readonly string[];
  beforeTitle: string;
  afterTitle: string;
};

function orbStyle(value: number, kind: "before" | "after") {
  const t = (value - 1) / 8;
  const hue = kind === "before" ? 240 - t * 80 : 160 + t * 40;
  const size = 80 + value * 12;
  return {
    width: `${size}rpx`,
    height: `${size}rpx`,
    background: `radial-gradient(circle at 30% 30%, hsla(${hue}, 70%, 65%, 0.9), hsla(${hue}, 60%, 35%, 0.5))`,
    boxShadow: `0 0 32rpx hsla(${hue}, 70%, 50%, 0.35)`,
  };
}

export function MoodShiftViz({ before, after, labels, beforeTitle, afterTitle }: Props) {
  const delta = after - before;
  const beforeLabel = labels[Math.max(0, Math.min(labels.length - 1, before - 1))];
  const afterLabel = labels[Math.max(0, Math.min(labels.length - 1, after - 1))];

  return (
    <View className="mood-shift">
      <View className="mood-shift__col">
        <Text className="mood-shift__caption">{beforeTitle}</Text>
        <View className="mood-shift__orb-wrap">
          <View className="mood-shift__orb" style={orbStyle(before, "before")} />
          <Text className="mood-shift__num">{before}</Text>
        </View>
        <Text className="mood-shift__mood">{beforeLabel}</Text>
      </View>

      <View className="mood-shift__mid">
        <View className={clsx("mood-shift__delta", delta > 0 && "mood-shift__delta--up", delta < 0 && "mood-shift__delta--down")}>
          <Text className="mood-shift__delta-num">{delta > 0 ? `+${delta}` : delta === 0 ? "±0" : String(delta)}</Text>
        </View>
        <View className="mood-shift__arrow">
          <View className="mood-shift__arrow-line" />
          <Text className="mood-shift__arrow-head">›</Text>
        </View>
      </View>

      <View className="mood-shift__col">
        <Text className="mood-shift__caption">{afterTitle}</Text>
        <View className="mood-shift__orb-wrap">
          <View className="mood-shift__orb" style={orbStyle(after, "after")} />
          <Text className="mood-shift__num">{after}</Text>
        </View>
        <Text className="mood-shift__mood">{afterLabel}</Text>
      </View>
    </View>
  );
}
