import { View } from "@tarojs/components";
import { clsx } from "../../utils/clsx";
import "./ProgressRail.scss";

type Props = {
  pct: number;
  className?: string;
};

export function ProgressRail({ pct, className }: Props) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <View className={clsx("ui-progress-rail", className)}>
      <View className="ui-progress-rail__track">
        <View className="ui-progress-rail__fill" style={{ width: `${clamped}%` }} />
        <View className="ui-progress-rail__glow" style={{ width: `${clamped}%` }} />
        <View className="ui-progress-rail__thumb" style={{ left: `${clamped}%` }} />
      </View>
    </View>
  );
}
