import { View } from "@tarojs/components";
import { clsx } from "../../utils/clsx";
import "./SpectrumBars.scss";

type Props = {
  active?: boolean;
  bars?: number;
  className?: string;
};

export function SpectrumBars({ active = false, bars = 24, className }: Props) {
  return (
    <View className={clsx("spectrum-bars", active && "spectrum-bars--active", className)}>
      {Array.from({ length: bars }, (_, i) => (
        <View
          key={i}
          className="spectrum-bars__bar"
          style={{
            animationDelay: `${(i % 8) * 0.08}s`,
            animationDuration: `${0.7 + (i % 5) * 0.15}s`,
          }}
        />
      ))}
    </View>
  );
}
