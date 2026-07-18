import { View, Text } from "@tarojs/components";
import { clsx } from "../../utils/clsx";
import "./MoodSpectrum.scss";

type Props = {
  title: string;
  value: number;
  onChange: (value: number) => void;
  labels: readonly string[];
  min?: number;
  max?: number;
};

export function MoodSpectrum({ title, value, onChange, labels, min = 1, max = 9 }: Props) {
  const steps = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const label = labels[Math.max(0, Math.min(labels.length - 1, value - min))] || String(value);

  return (
    <View className="mood-spectrum">
      <Text className="mood-spectrum__title">{title}</Text>
      <View className="mood-spectrum__hero">
        <Text className="mood-spectrum__value">{value}</Text>
        <Text className="mood-spectrum__label">{label}</Text>
      </View>
      <View className="mood-spectrum__track">
        <View className="mood-spectrum__gradient" />
        {steps.map((n) => (
          <View
            key={n}
            className={clsx(
              "mood-spectrum__dot",
              value === n && "mood-spectrum__dot--active",
              value >= n && "mood-spectrum__dot--filled"
            )}
            onClick={() => onChange(n)}
          >
            <View className="mood-spectrum__dot-inner" />
          </View>
        ))}
      </View>
      <View className="mood-spectrum__ends">
        <Text className="mood-spectrum__emoji">😔</Text>
        <Text className="mood-spectrum__hint">{labels[0]}</Text>
        <Text className="mood-spectrum__hint mood-spectrum__hint--right">{labels[labels.length - 1]}</Text>
        <Text className="mood-spectrum__emoji">😊</Text>
      </View>
    </View>
  );
}
