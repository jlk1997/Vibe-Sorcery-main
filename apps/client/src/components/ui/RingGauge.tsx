import { View, Text } from "@tarojs/components";
import { clsx } from "../../utils/clsx";
import "./RingGauge.scss";

type Props = {
  value: number;
  max?: number;
  label: string;
  sublabel?: string;
  onClick?: () => void;
};

export function RingGauge({ value, max = 20, label, sublabel, onClick }: Props) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const deg = (pct / 100) * 360;

  return (
    <View className={clsx("ui-ring-gauge", onClick && "ui-ring-gauge--clickable")} onClick={onClick}>
      <View
        className="ui-ring-gauge__ring"
        style={{
          background: `conic-gradient(#d4af6a ${deg}deg, rgba(22, 22, 34, 0.95) ${deg}deg)`,
        }}
      >
        <View className="ui-ring-gauge__inner">
          <Text className="ui-ring-gauge__value">{value}</Text>
        </View>
      </View>
      <Text className="ui-ring-gauge__label">{label}</Text>
      {sublabel && <Text className="ui-ring-gauge__sub">{sublabel}</Text>}
    </View>
  );
}
