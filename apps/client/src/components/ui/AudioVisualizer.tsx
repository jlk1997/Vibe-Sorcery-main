import { View } from "@tarojs/components";
import { clsx } from "../../utils/clsx";
import "./AudioVisualizer.scss";

type Props = {
  active?: boolean;
  bars?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
};

export function AudioVisualizer({ active = false, bars = 5, size = "md", className }: Props) {
  return (
    <View className={clsx("ui-audio-viz", `ui-audio-viz--${size}`, active && "ui-audio-viz--active", className)}>
      {Array.from({ length: bars }, (_, i) => (
        <View key={i} className="ui-audio-viz__bar" style={{ animationDelay: `${i * 0.12}s` }} />
      ))}
    </View>
  );
}
